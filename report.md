# AI Applications: Research Paper Study and Module Implementation

**Topic:** Adversarially-robust, lightweight phishing URL detection
**Paper studied:** *Adversarial-resilient lightweight phishing URL detection: Evaluating lexical & metadata features under evasion techniques*, Scientific Reports **16**, 26668 (July 2026). [nature.com/articles/s41598-026-60046-3](https://www.nature.com/articles/s41598-026-60046-3)
**Dataset used for the replication:** PhiUSIIL Phishing URL Dataset, UCI Machine Learning Repository #967
**Code:** this repository (`src/`), results in `results/`

---

<!-- RESULTS-PENDING: sections 1-4 are final, sections 5+ are filled in after the experiment run -->

## 1. Research paper study

### 1.1 Problem statement

Phishing is one of the most common and fastest-changing cyber threats. Attackers build URLs that imitate trusted brands to steal credentials and payment details. Machine-learning detectors report excellent accuracy in the literature, but almost all of them are evaluated only on *clean* data: the test URLs are the same kind of URLs the model was trained on.

Real attackers adapt. The paper points out that published models ignore **adversarial evasion**, meaning small, deliberate edits to a phishing URL that keep it working but push it across the decision boundary:

- **obfuscation** (e.g. the `user@host` trick),
- **encoding manipulation** (percent-encoding characters),
- **homoglyph substitution** (`paypal` → `paypa1`, or Cyrillic `а` for Latin `a`),
- **token padding** (adding trust words or junk tokens),
- **subdomain reordering**.

The question is: *how much does a lexical phishing detector degrade under these evasions, and can it be made resilient without becoming heavy?*

### 1.2 AI approach

The authors propose **AR-LRF (Adversarial-Resilient Lightweight Random Forest)**. It has two ingredients:

1. **Controlled ensemble complexity.** A Random Forest whose size and depth are bounded, so it stays fast and small enough for real-time or edge deployment.
2. **Adversarial training.** Simulated adversarial perturbations of URLs are added to the training data, so the forest learns decision rules that still hold when a URL has been manipulated.

A Random Forest is an ensemble of decision trees. Each tree is trained on a bootstrap sample of the data, using a random subset of features at each split, and the trees vote. That gives low variance, good accuracy on tabular features, fast inference, and built-in feature importances, which matter for interpretability in security tooling.

### 1.3 Data sources, features and evaluation

- **Data:** a large, imbalanced, real-world corpus of about **650,000 URLs**.
- **Features:** lexical, structural and metadata features derived from the URL. The paper deliberately avoids raw-URL deep models and deep packet inspection, which preserves privacy and keeps deployment cheap.
- **Metrics:** accuracy, precision, recall, F1 and ROC-AUC, on clean data and under each evasion technique. The key quantity is *performance degradation* from clean to attacked.
- **Headline result:** AR-LRF reaches **99.78% accuracy and ROC-AUC 0.9999 on clean data**, with significantly smaller degradation under adversarial perturbation than conventional models.

## 2. Conceptual understanding

### 2.1 Key components of the system

```
 raw URL ──► feature extractor ──► bounded Random Forest ──► P(phishing) ──► block / allow
                   ▲                        ▲
                   │                        │
          lexical / structural      trained on clean URLs
          features only             + adversarially perturbed URLs
          (no page fetch, no DPI)   (simulated evasions)
```

| Component | Role |
|---|---|
| Feature extraction | Turns the URL string into a fixed numeric vector (lengths, character counts and ratios, entropy, host properties) |
| Evasion simulator | Generates perturbed copies of phishing URLs that imitate attacker tricks |
| Bounded Random Forest | Lightweight classifier with depth and leaf limits |
| Robustness evaluation | Compares metrics on clean and perturbed test sets |

### 2.2 Modules that can be implemented practically

All of the following were implemented in this project:

1. **Data preprocessing:** download, label normalisation, de-duplication, stratified split (`src/data.py`).
2. **Feature extraction:** 29 lexical features computed from the URL string only (`src/features.py`).
3. **Evasion attacks:** 7 attacks plus one combined attack (`src/attacks.py`).
4. **Model training:** baseline classifiers and the hardened AR-LRF (`src/experiment.py`).
5. **Prediction and demo:** a command-line scorer (`src/predict.py`).

## 3. Implementation

### 3.1 Dataset: PhiUSIIL

PhiUSIIL (Prasad & Chandra, 2024) contains 235,795 URLs (134,850 legitimate, 100,945 phishing). The CSV ships with 50+ pre-computed features, some of which require fetching the web page (HTML lines, forms, iframes). **Only the `URL` and `label` columns are used.** Every feature is recomputed from the URL string, because:

- it matches the paper's lightweight, no-page-fetch setting, and
- an adversarial edit to the URL must actually change the features. Pre-computed columns would not change when the URL is attacked.

The original label uses `1 = legitimate`. It is flipped so that **`1 = phishing`**, which makes *recall = phishing detection rate*. After removing duplicate URLs, the data is split 80/20 with stratification (seed 42).

### 3.2 Features (29, all lexical)

| Group | Features |
|---|---|
| Length | `url_len`, `host_len`, `path_len`, `query_len`, `tld_len`, `longest_token` |
| Character counts | `n_dots`, `n_hyphens`, `n_underscores`, `n_slashes`, `n_digits`, `n_special`, `n_percent_enc`, `n_non_ascii`, `host_hyphens` |
| Ratios | `digit_ratio`, `letter_ratio`, `special_ratio`, `host_digit_ratio` |
| Host properties | `host_is_ip`, `has_port`, `n_subdomains`, `has_www`, `has_punycode`, `has_at` |
| Other | `is_https`, `n_query_params`, `n_suspicious_words` (login, verify, secure, ...), `entropy` (Shannon entropy of the URL) |

Extracting features for all 235k URLs takes a few seconds in pure Python.

### 3.3 Evasion attacks

Attacks are applied **only to phishing URLs in the test set**. Legitimate test URLs stay unchanged, because the attacker controls their own phishing URL, not other people's sites. Each attack keeps the URL functional from the attacker's side: they own the domain, so they can register look-alike names, add subdomains and serve the page under any path.

| Attack | Example | Paper family |
|---|---|---|
| `homoglyph_ascii` | `paypal.com` → `paypa1.com` | homoglyph substitution |
| `homoglyph_unicode` | `paypal.com` → `рaypal.com` (Cyrillic `р`, `а`) | homoglyph substitution |
| `token_padding` | `evil.com` → `secure-login-verify.evil.com` | token padding |
| `encoding` | `/signin` → `/%73%69%67%6E%69%6E` | encoding manipulation |
| `subdomain_reorder` | `a.b.evil.com` → `b.a.evil.com` | subdomain reordering |
| `obfuscation` | `http://www.google.com@evil.com/` | obfuscation |
| `benign_mimicry` | `http://evil.com/x` → `https://www.evil.com/x` | (added) imitate the typical legitimate URL |
| `combined` | homoglyph_unicode → subdomain_reorder → benign_mimicry | chained |

`benign_mimicry` is not in the paper's list. It was added after inspecting the dataset (Section 5.1): it is the cheapest change a real attacker can make (a free TLS certificate and a `www` record) and it targets this dataset's strongest bias.

### 3.4 Models

| Model | Configuration | Purpose |
|---|---|---|
| Logistic Regression | standardised features | linear baseline |
| Decision Tree | `max_depth=15` | single-tree baseline |
| **Random Forest (baseline)** | 100 trees, unbounded depth, clean data only | the model being attacked |
| LRF (ablation) | 100 trees, `max_depth=20`, `min_samples_leaf=2`, clean data only | isolates the effect of bounding the forest |
| **AR-LRF (hardened)** | same bounded forest + one adversarial copy of every training phishing URL (attack chosen at random from the 7 base attacks) | the paper's approach |

The `combined` attack is never used for augmentation. For a fairer generalisation test, a **leave-one-attack-out** study retrains AR-LRF with one attack removed from augmentation and evaluates on that unseen attack.
