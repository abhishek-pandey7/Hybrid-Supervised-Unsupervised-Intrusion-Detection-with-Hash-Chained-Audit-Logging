# Demo Guide

How to show the project live in about 5 minutes. Every score below was checked against the deployed Docker image on 2026-10-17. It matches `report.md`, `results/demo_predictions.csv` and `python src/predict.py`.

---

## Before the viva

1. **Wake the site up about 2 minutes early.** Render's free tier sleeps after 15 minutes idle, and the first request takes about a minute. Open the link, wait for the Overview page, and leave the tab open.
2. **Have Wi-Fi.** The page loads its fonts and the 3D library (Three.js) from a CDN. Without internet, the 3D plot won't appear.
3. **Have a local fallback ready**, in case the site or the internet fails:
   ```bash
   python app/server.py                                   # http://127.0.0.1:8000
   python src/predict.py --attacks "http://www.institutohumanus.org.br"   # terminal version
   ```
4. **Know the scoring.** Both models give a probability of phishing. 0.50 or above means PHISH.

---

## The 5-minute script

| # | Tab | Do this | Say this |
|---|---|---|---|
| 1 | **Overview** | Point at the headline and the three cards. Drag the 3D plot, then click **After benign mimicry**. | "Clean recall is 99.6%. Add `https://www.` and it drops to 63.6%. Watch the phishing points move into the legitimate cluster." |
| 2 | **Features & data** | Show the URL-shape numbers (100% / 100% / 0%) and the 3-feature shortcut. | "Every legitimate URL in the dataset is a bare `https://www` homepage. A 3-feature tree gets 99.75%. That is the shortcut." |
| 3 | **Attack lab** | Click the sample **`www.institutohumanus.org.br`**. | "This is a real phishing URL from the test set. Clean, both models flag it. Benign mimicry takes the baseline to 0.00 and AR-LRF to 0.07. Both miss it." |
| 4 | **Attack lab** | Click the sample **`www.wikipedia.org`** and look at the Unicode homoglyph row. | "Cyrillic letters that look like `wikipedia`. The baseline says 0.00, it lets it through. AR-LRF says 0.93. That's the clearest win for adversarial training." |
| 5 | **Attack lab** | Click **`paypal.com.secure-update.info/login`**. | "A phishing URL with a telling path is caught under every attack. Mimicry only works on bare domains." |
| 6 | **Robustness** | Show the recall chart and the leave-one-attack-out table. | "AR-LRF fixes the combined attack (95.4%), but not pure mimicry (67.4%). And it doesn't help against an attack it never saw." |
| 7 | **Scan a URL** | Type `youtube.com/watch?v=dQw4w9WgXcQ`. | "Here's the honest limitation. A real YouTube link is flagged as phishing, because the model never saw a legitimate URL with a path. The 99.8% wouldn't survive deployment." |

If time is short, do steps 3, 4 and 7. They tell the whole story.

---

## Demo URLs (all checked)

Scores are shown as **baseline RF / AR-LRF**. "Mimicry", "Unicode" and "Combined" are rows in the Attack lab.

### The main finding: mimicry breaks both models

| Type exactly | Clean | Mimicry | Combined | What it shows |
|---|---|---|---|---|
| `http://www.institutohumanus.org.br` | 1.00 / 0.99 | **0.00 / 0.07** | 0.00 / 0.63 | A real phishing URL that one edit turns "legitimate" |
| `http://www.dfuimiubaifhimoofmfpbmdjjedaaphs.top` | 0.98 / 0.99 | **0.01 / 0.22** | 0.00 / 0.64 | Even a random-looking domain gets through |
| `http://apple-id-verify-account.top` | 1.00 / 0.99 | **0.25 / 0.47** | 0.05 / 0.47 | A made-up brand phish: both models miss it after mimicry |

### Adversarial training wins: homoglyphs

| Type exactly | Clean | Unicode homoglyph | What it shows |
|---|---|---|---|
| `https://www.wikipedia.org` | 0.01 / 0.03 | **0.00 / 0.93** | The baseline misses the look-alike; AR-LRF catches it |
| `https://www.paypal.com` | 0.00 / 0.03 | **0.00 / 0.93** | Same, with a brand people know |
| `https://www.google.com` | 0.00 / 0.03 | **0.00 / 0.93** | Same |

### Always caught: phishing with obvious signs

| Type exactly | Every attack | Why |
|---|---|---|
| `http://paypal.com.secure-update.info/login` | 1.00 / 1.00 | Brand hidden in a subdomain, plus a `/login` path |
| `http://www.google.com@evil-site.xyz/login` | 1.00 / 1.00 | The `@` trick: the browser actually goes to `evil-site.xyz` |
| `http://192.168.1.10/login.php` | ≥ 0.97 / ≥ 0.99 | An IP address instead of a domain |
| `http://free-gift-card-winner.xyz/claim?id=123` | 1.00 / 1.00 | A path and a query string |

### Correctly legitimate

| Type exactly | Clean |
|---|---|
| `https://www.amazon.in` | 0.00 / 0.03 |
| `https://www.netflix.com` | 0.00 / 0.05 |
| `https://www.microsoft.com` | 0.01 / 0.03 |
| `https://www.onlinesbi.sbi` | 0.01 / 0.03 |

### The honest limitation: real deep links get flagged

| Type exactly | Clean | Truth |
|---|---|---|
| `https://www.youtube.com/watch?v=dQw4w9WgXcQ` | **1.00 / 1.00** | legitimate |
| `https://github.com/login` | **1.00 / 1.00** | legitimate |
| `https://docs.python.org/3/library/urllib.html` | **1.00 / 1.00** | legitimate |
| `https://accounts.google.com/signin` | **1.00 / 1.00** | legitimate |

Show one of these on purpose. Examiners respect a team that demonstrates its own limitation (report: Limitations #1).

---

## Gotchas

- **Always type the scheme (`http://` or `https://`).** If you type `www.institutohumanus.org.br` without it, the app adds `https://` automatically. That means the "clean" URL already has the mimicry shape, so it scores 0.00 and looks like a failure. The sample buttons include the scheme, so they're safe.
- **The rounding difference: 63.5% vs 63.6%.** The Overview card says the combined attack went "up from 63.5%", while the report says 63.6%. The stored recall is 0.6355, exactly on the rounding boundary. Both are correct to one decimal.
- **Bad input is handled.** Empty input, URLs with spaces and URLs over 2,048 characters show an error message instead of crashing.
- **Nothing is fetched.** Scanning a real phishing URL is safe, because the app reads only the text.
