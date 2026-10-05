# Adversarially-robust lightweight phishing URL detection

A simplified replication of *"Adversarial-resilient lightweight phishing URL detection: Evaluating lexical & metadata features under evasion techniques"* (Scientific Reports 16, 26668, 2026) on the PhiUSIIL Phishing URL dataset (UCI #967).

Pipeline: lexical features from the raw URL → Random Forest → evasion attacks applied to phishing test URLs → adversarially-hardened Random Forest (AR-LRF style).

See **[report.md](report.md)** for the full assignment report.

## Run

```bash
pip install -r requirements.txt
python src/experiment.py          # ~13 min on a laptop CPU: downloads data, trains, attacks, hardens, writes results/
python src/predict.py "http://paypa1-login.example.com/verify"   # demo
python -m pytest -q tests
```

## Layout

| Path | What |
|---|---|
| `src/data.py` | Downloads PhiUSIIL from UCI, flips labels so 1 = phishing, de-duplicates |
| `src/features.py` | 29 lexical features computed from the URL string only |
| `src/attacks.py` | 8 evasion attacks (homoglyph, token padding, encoding, subdomain reorder, obfuscation, mimicry, combined) |
| `src/experiment.py` | Full experiment: clean → attacked → hardened, plots and metrics |
| `src/predict.py` | Command-line demo on individual URLs |
| `results/` | Metrics (JSON/CSV) and figures |
