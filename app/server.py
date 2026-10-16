"""Web UI for the phishing URL detector.

    python app/server.py              # then open http://127.0.0.1:8000

Serves the single-page app in app/static plus a small JSON API:

    GET  /api/results   everything src/experiment.py wrote to results/
    POST /api/scan      score one URL with both models, plus every evasion variant of it

Scanning works on the URL text only (the same lexical features the models were
trained on); nothing is fetched. Train the models first with src/experiment.py,
otherwise /api/scan still returns features and attack variants but no scores.
"""
import csv
import difflib
import json
import os
import re
import sys
import threading
from pathlib import Path

import joblib
from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "src"))
from attacks import ATTACKS, _split_host  # noqa: E402
from features import FEATURE_NAMES, featurize  # noqa: E402

RESULTS = ROOT / "results"
MODELS = ROOT / "models"
STATIC = Path(__file__).resolve().parent / "static"
MAX_URL_LEN = 2048

app = FastAPI(title="AR-LRF phishing URL lab", docs_url="/api/docs", redoc_url=None)

# ------------------------------------------------------------------ models
_models = None
_models_lock = threading.Lock()


def load_models():
    """Load both forests once; returns None until src/experiment.py has written them."""
    global _models
    with _models_lock:
        if _models is None:
            try:
                rf = joblib.load(MODELS / "rf_baseline.joblib")["model"]
                ar = joblib.load(MODELS / "ar_lrf.joblib")["model"]
            except FileNotFoundError:
                return None
            # scoring a handful of URLs: thread start-up costs more than it saves
            rf.n_jobs = ar.n_jobs = 1
            _models = {"rf": rf, "ar_lrf": ar}
        return _models


def models_ready() -> bool:
    return _models is not None or (
        (MODELS / "rf_baseline.joblib").exists() and (MODELS / "ar_lrf.joblib").exists())


# ------------------------------------------------------------------ URL helpers
def anatomy(url: str) -> list:
    """Split the URL into labelled, contiguous pieces that join back to the exact input."""
    out = []

    def add(kind, text):
        if text:
            out.append({"kind": kind, "text": text})

    pos = 0
    m = re.match(r"^([A-Za-z][A-Za-z0-9+.\-]*)(://)", url)
    if m:
        add("scheme", m.group(1))
        add("sep", "://")
        pos = m.end()
    ends = [j for j in (url.find(ch, pos) for ch in "/?#") if j != -1]
    end = min(ends) if ends else len(url)

    userinfo, at, hostport = url[pos:end].rpartition("@")
    if at:
        add("userinfo", userinfo)
        add("sep", "@")
    port = re.search(r":\d+$", hostport)
    host = hostport[:port.start()] if port else hostport
    if re.fullmatch(r"\d{1,3}(\.\d{1,3}){3}", host):
        subs, name, suffix = [], host, ""      # an IP address has no subdomains
    else:
        subs, name, suffix = _split_host(host)
    for s in subs:
        add("subdomain", s)
        add("sep", ".")
    add("domain", name)
    if suffix:
        add("sep", ".")
        add("suffix", suffix)
    if port:
        add("port", port.group(0))

    tail = url[end:]
    q, f = tail.find("?"), tail.find("#")
    if f != -1 and (q == -1 or f < q):
        q = -1                                  # a '?' after '#' belongs to the fragment
    path_end = min(j for j in (q, f, len(tail)) if j != -1)
    add("path", tail[:path_end])
    if q != -1:
        add("query", tail[q:f if f != -1 else len(tail)])
    if f != -1:
        add("fragment", tail[f:])

    if "".join(p["text"] for p in out) != url:  # parser disagreed with itself: show it raw
        return [{"kind": "other", "text": url}]
    return out


def diff(original: str, variant: str) -> list:
    """Character-level diff of `variant` against `original`, as segments of the variant."""
    sm = difflib.SequenceMatcher(None, original, variant, autojunk=False)
    return [{"op": "equal" if op == "equal" else "changed", "text": variant[j1:j2]}
            for op, _, _, j1, j2 in sm.get_opcodes() if j2 > j1]


def safe_attack(fn, url):
    try:
        return fn(url)
    except Exception:                           # an attack that cannot apply leaves the URL as is
        return url


# ------------------------------------------------------------------ API
class ScanRequest(BaseModel):
    url: str = Field(..., max_length=MAX_URL_LEN)


@app.post("/api/scan")
def scan(req: ScanRequest):
    url = req.url.strip()
    if not url:
        raise HTTPException(422, "Enter a URL to scan.")
    if any(ch.isspace() for ch in url):
        raise HTTPException(422, "A URL can't contain spaces. Check the address and try again.")
    scheme_added = "://" not in url
    if scheme_added:
        url = "https://" + url

    variants = [("clean", url)] + [(name, safe_attack(fn, url)) for name, fn in ATTACKS.items()]
    X = featurize([u for _, u in variants])

    m = load_models()
    if m:
        p_rf = m["rf"].predict_proba(X)[:, 1]
        p_ar = m["ar_lrf"].predict_proba(X)[:, 1]
        scores = [{"rf": round(float(a), 4), "ar_lrf": round(float(b), 4)} for a, b in zip(p_rf, p_ar)]
    else:
        scores = [None] * len(variants)

    return {
        "url": url,
        "scheme_added": scheme_added,
        "models_ready": m is not None,
        "anatomy": anatomy(url),
        "features": [{"name": n, "value": round(float(v), 4)} for n, v in zip(FEATURE_NAMES, X.iloc[0])],
        "scores": scores[0],
        "variants": [
            {"attack": name, "url": v, "changed": v != url, "diff": diff(url, v), "scores": s}
            for (name, v), s in zip(variants[1:], scores[1:])
        ],
    }


def _read_csv(path: Path) -> list:
    if not path.exists():
        return []
    with path.open(encoding="utf-8") as fh:
        rows = list(csv.DictReader(fh))
    for r in rows:
        for k, v in r.items():
            try:
                r[k] = float(v)
            except (TypeError, ValueError):
                pass
    return rows


def _read_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else None


@app.get("/api/results")
def results():
    metrics = _read_json(RESULTS / "metrics.json")
    if metrics is None:
        raise HTTPException(404, "results/metrics.json is missing. Run `python src/experiment.py` first.")
    return {
        "metrics": metrics,
        "feature_importance": _read_csv(RESULTS / "feature_importance.csv"),
        "demo_predictions": _read_csv(RESULTS / "demo_predictions.csv"),
        "projection": _read_json(RESULTS / "projection.json"),
        "models_ready": models_ready(),
        "attacks": list(ATTACKS),
    }


@app.middleware("http")
async def revalidate_static(request, call_next):
    # ES modules are cached aggressively by heuristic; make the browser revalidate (ETag) instead
    response = await call_next(request)
    response.headers.setdefault("Cache-Control", "no-cache")
    return response


app.mount("/", StaticFiles(directory=STATIC, html=True), name="ui")


if __name__ == "__main__":
    import uvicorn

    port = int(os.environ.get("PORT", 8000))
    print(f"Phishing URL lab running at http://127.0.0.1:{port}  (Ctrl+C to stop)")
    uvicorn.run(app, host="127.0.0.1", port=port, log_level="warning")
