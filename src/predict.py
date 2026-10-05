"""Demo: score URLs with the baseline RF and the hardened AR-LRF.

    python src/predict.py "http://paypa1-login.example.com/verify" "https://www.wikipedia.org"
    python src/predict.py --attacks "http://evil-login.com/acct"   # also score every evasion of it

Run src/experiment.py first; it writes the models to models/.
"""
import argparse
import sys
from pathlib import Path

import joblib

sys.path.insert(0, str(Path(__file__).resolve().parent))
from attacks import ATTACKS
from features import featurize

MODELS = Path(__file__).resolve().parent.parent / "models"


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("urls", nargs="+")
    ap.add_argument("--attacks", action="store_true", help="also score each attacked variant")
    args = ap.parse_args()

    try:
        rf = joblib.load(MODELS / "rf_baseline.joblib")["model"]
        ar = joblib.load(MODELS / "ar_lrf.joblib")["model"]
    except FileNotFoundError:
        sys.exit("models/ not found - run `python src/experiment.py` first")

    rows = []
    for u in args.urls:
        rows.append(("clean", u))
        if args.attacks:
            rows += [(name, fn(u)) for name, fn in ATTACKS.items()]
    X = featurize([u for _, u in rows])
    p_rf, p_ar = rf.predict_proba(X)[:, 1], ar.predict_proba(X)[:, 1]

    print(f"{'variant':18s} {'RF':>12s} {'AR-LRF':>12s}  url")
    for (name, u), a, b in zip(rows, p_rf, p_ar):
        verdict = lambda p: f"{'PHISH' if p >= 0.5 else 'legit'} {p:5.2f}"
        print(f"{name:18s} {verdict(a):>12s} {verdict(b):>12s}  {u[:80]}")


if __name__ == "__main__":
    main()
