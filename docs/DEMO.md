# Demo Guide

**Live site:** https://ar-lrf-phishing-lab.onrender.com

The demo takes about 5 minutes. Every score below was checked on the live site.

Scores are the chance a URL is phishing, shown as **baseline RF / AR-LRF**. **0.50 or more means the model flags it as phishing.**

---

## Before you start (2 minutes before the viva)

1. Open https://ar-lrf-phishing-lab.onrender.com in your browser.
2. Wait for the Overview page to appear. If the site has been idle, the first load takes about a minute because the free server has to wake up.
3. Leave the tab open.
4. Make sure you're on Wi-Fi. The 3D plot loads from the internet.

**If the site doesn't load,** run it on your laptop instead:
```bash
python app/server.py        # then open http://127.0.0.1:8000
```

---

## Step 1: The headline (Overview tab)

1. Point at the big heading: *"Catches 99.6% of phishing URLs. Misses 36% once they start with https://www."*
2. Point at the three number cards at the bottom (99.6% → 63.6% → 95.4%).

**Say:** "On clean data our model catches 99.6% of phishing URLs, the same as the paper. But when phishing URLs start with `https://www.`, it misses about a third."

## Step 2: Show it visually (Overview tab, 3D plot)

1. Point at the **white blob**: "These are 700 legitimate URLs. They all look the same to the model, because every legitimate URL in the dataset is a bare `https://www` homepage."
2. Point at the **red dots**: "These are 700 phishing URLs, spread out because phishing URLs vary a lot."
3. Click **"With https://www. added"**.
4. Watch the red dots move toward the white blob. Hollow rings appear: those are phishing URLs the model now misses (269 of 700).

**Say:** "Adding `https://www.` moves the phishing URLs on top of the legitimate ones, and that's where the model stops catching them."

## Step 3: Why it happens (Features & data tab)

1. Click the **Features & data** tab.
2. Point at the URL-shape numbers: legitimate URLs are 100% https, 100% www and 0% have a path.
3. Point at the shortcut result: a 3-feature tree gets 99.75%.

**Say:** "The model didn't learn what phishing looks like. It learned that https with no path means safe. That's a shortcut in the dataset."

## Step 4: Break it live (Attack lab tab)

1. Click the **Attack lab** tab.
2. Click the sample button **`www.institutohumanus.org.br`**. It's a real phishing URL from the test set.
3. Point at the **clean** score: **1.00 / 0.99**, so both models catch it.
4. Point at the **Benign mimicry** row: **0.00 / 0.07**, so both models now call it legitimate.

**Say:** "One free change, a TLS certificate and a `www` record, and the phishing URL gets through both models."

## Step 5: Where hardening helps (Attack lab tab)

1. Click the sample button **`www.wikipedia.org`**.
2. Point at the **Homoglyph (Unicode)** row. It shows `wikiреdiа.org` with Cyrillic letters that look identical to Latin ones.
3. The baseline says **0.00** and lets it through. AR-LRF says **0.93** and catches it.

**Say:** "This is where adversarial training works. AR-LRF learned that non-English characters in a domain are suspicious."

## Step 6: What always gets caught (Attack lab tab)

1. Click the sample button **`paypal.com.secure-update.info/login`**.
2. Point out that every row stays at **1.00 / 1.00**.

**Say:** "A phishing URL with a telling path like `/login` is caught under every attack. The weakness is only bare domains."

## Step 7: The honest limitation (Scan a URL tab)

1. Click the **Scan a URL** tab.
2. Type `https://www.youtube.com/watch?v=dQw4w9WgXcQ` and click **Scan URL**.
3. It says **phishing (1.00)**, even though it's a real YouTube link.

**Say:** "This is the same shortcut from the other side. The model never saw a legitimate URL with a path, so it flags real links like this. The 99.8% would not survive real-world use."

## Step 8: Wrap up (Robustness tab, optional)

1. Click the **Robustness** tab.
2. Point at the recall chart: adversarial training fixes the combined attack (95.4%) but not mimicry (67.4%).
3. Point at the leave-one-attack-out table: with mimicry left out of training, AR-LRF scores 63.9%, no better than no hardening.

**Say:** "Adversarial training only protects against attacks it has already seen."

**Short on time?** Do steps 4, 5 and 7. They tell the whole story.

---

## Extra URLs if the examiner wants to try more

Always type the full URL, including `http://` or `https://`.

| Type this | Clean | After `https://www.` | What it shows |
|---|---|---|---|
| `http://apple-id-verify-account.top` | 1.00 / 0.99 | **0.25 / 0.47** | A made-up phishing domain that gets through |
| `http://www.dfuimiubaifhimoofmfpbmdjjedaaphs.top` | 0.98 / 0.99 | **0.01 / 0.22** | Even a random-looking domain gets through |
| `http://www.google.com@evil-site.xyz/login` | 1.00 / 1.00 | 1.00 / 1.00 | The `@` trick (the browser goes to `evil-site.xyz`), always caught |
| `http://192.168.1.10/login.php` | 1.00 / 1.00 | 0.97 / 0.99 | An IP address instead of a domain, always caught |
| `https://www.paypal.com` | 0.00 / 0.03 | n/a | Legitimate. The Unicode homoglyph version scores 0.00 / 0.93. |
| `https://www.amazon.in` | 0.00 / 0.03 | n/a | Legitimate, correct |
| `https://github.com/login` | **1.00 / 1.00** | n/a | Legitimate but flagged (the limitation) |

---

## Watch out for

- **Type `http://` or `https://`.** If you leave it out, the app adds `https://` itself. A phishing URL then already has the mimicry shape, scores about 0, and looks like a failure. The sample buttons are safe.
- **63.5% vs 63.6%.** The Overview card says "up from 63.5%" and the report says 63.6%. It's the same number (0.6355) rounded differently.
- **Scanning is safe.** The app only reads the URL text. It never opens the page.
