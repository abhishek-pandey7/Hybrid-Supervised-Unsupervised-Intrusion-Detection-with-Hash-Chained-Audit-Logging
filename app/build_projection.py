"""Build results/projection.json, the 3-D feature-space view shown on the UI's overview tab.

    python app/build_projection.py     # after src/experiment.py (needs data/, uses models/ if present)

A balanced sample of *test-set* URLs is featurised, log-compressed and standardised;
each feature is then weighted by the square root of the baseline forest's importance
(results/feature_importance.csv), so distances reflect what the model actually looks
at, and the result is projected onto its first three principal components.

Every phishing URL in the sample is projected a second time after the benign-mimicry
attack, so the UI can animate how far that one cosmetic edit moves it toward the
legitimate cluster. When the trained
models exist, each attacked URL also records whether the baseline RF and AR-LRF
still flag it.
"""
import json
import sys
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.decomposition import PCA
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "src"))
import data  # noqa: E402
from attacks import ATTACKS  # noqa: E402
from features import FEATURE_NAMES, featurize  # noqa: E402

SEED = 42
PER_CLASS = 700
OUT = ROOT / "results" / "projection.json"


def compress(X):
    X = X.to_numpy(dtype=np.float64)
    return np.sign(X) * np.log1p(np.abs(X))   # long URLs shouldn't flatten everything else


def main():
    df = data.load()
    y = df.phishing.to_numpy()
    # the same split as src/experiment.py, so every point is a URL the models never trained on
    _, idx_te = train_test_split(np.arange(len(df)), test_size=0.2, stratify=y, random_state=SEED)
    rng = np.random.default_rng(SEED)
    legit_idx = rng.choice(idx_te[y[idx_te] == 0], PER_CLASS, replace=False)
    phish_idx = rng.choice(idx_te[y[idx_te] == 1], PER_CLASS, replace=False)

    legit_urls = df.url.iloc[legit_idx].tolist()
    phish_urls = df.url.iloc[phish_idx].tolist()
    mimic_urls = [ATTACKS["benign_mimicry"](u) for u in phish_urls]
    X_legit, X_phish, X_mimic = featurize(legit_urls), featurize(phish_urls), featurize(mimic_urls)

    importance = pd.read_csv(ROOT / "results" / "feature_importance.csv").set_index("feature")
    weight = np.sqrt(importance.loc[FEATURE_NAMES, "rf"].to_numpy()) + 1e-3

    clean = np.vstack([compress(X_legit), compress(X_phish)])
    scaler = StandardScaler().fit(clean)
    weigh = lambda X: scaler.transform(compress(X)) * weight
    pca = PCA(n_components=3, random_state=SEED).fit(np.vstack([weigh(X_legit), weigh(X_phish)]))
    proj = lambda X: pca.transform(weigh(X))
    P_legit, P_phish, P_mimic = proj(X_legit), proj(X_phish), proj(X_mimic)

    # rescale each axis to roughly [-1, 1] on the clean points; clip the far tail
    span = np.percentile(np.abs(np.vstack([P_legit, P_phish])), 98, axis=0)
    fit = lambda P: np.clip(P / span, -1.3, 1.3).round(3).tolist()

    out = {
        "n_per_class": PER_CLASS,
        "weighting": "sqrt(baseline RF feature importance)",
        "explained_variance": pca.explained_variance_ratio_.round(4).tolist(),
        "legit": fit(P_legit),
        "phishing": {"clean": fit(P_phish), "mimicry": fit(P_mimic)},
    }

    try:
        rf = joblib.load(ROOT / "models" / "rf_baseline.joblib")["model"]
        ar = joblib.load(ROOT / "models" / "ar_lrf.joblib")["model"]
        out["phishing"]["rf_caught"] = {"clean": rf.predict(X_phish).astype(int).tolist(),
                                        "mimicry": rf.predict(X_mimic).astype(int).tolist()}
        out["phishing"]["ar_lrf_caught"] = {"clean": ar.predict(X_phish).astype(int).tolist(),
                                            "mimicry": ar.predict(X_mimic).astype(int).tolist()}
    except FileNotFoundError:
        print("models/ not found: writing the projection without detection flags")

    OUT.write_text(json.dumps(out, separators=(",", ":")))
    print(f"wrote {OUT} ({OUT.stat().st_size / 1024:.0f} KB), "
          f"explained variance {out['explained_variance']}")
    if "rf_caught" in out["phishing"]:
        for k in ("rf_caught", "ar_lrf_caught"):
            c = out["phishing"][k]
            print(f"  {k}: clean {np.mean(c['clean']):.3f}  after mimicry {np.mean(c['mimicry']):.3f}")


if __name__ == "__main__":
    main()
