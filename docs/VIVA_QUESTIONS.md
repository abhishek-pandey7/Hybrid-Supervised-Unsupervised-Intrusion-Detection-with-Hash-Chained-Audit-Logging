# Viva Prep: Phishing URL Detection Under Evasion (AR-LRF Replication)

> Viva preparation for this project. Live demo steps are in [DEMO.md](DEMO.md); the reasoning behind each design choice is in [ARCHITECTURE_DECISIONS.md](ARCHITECTURE_DECISIONS.md).

Each question has a short spoken answer. Numbers come from `results/metrics.json`. The cheat sheet at the bottom has the ones worth memorising.

---

## 0. The 30-second pitch (memorise this)

> "We replicated a 2026 Scientific Reports paper on phishing URL detection that is lightweight and resists evasion. We extracted 29 lexical features from the raw URL string, trained a Random Forest on the public PhiUSIIL dataset, and got 99.79% accuracy, the same as the paper. Then we attacked our own model with eight URL evasion techniques. Most textbook attacks did nothing. A trivial one, adding `https://www.` to the URL, cut phishing recall from 99.6% to 63.6%, because every legitimate URL in the dataset has exactly that shape. Adversarial training (AR-LRF) fixed the combined attack (63.6% → 95.4%) but not mimicry, and it doesn't generalise to attacks it hasn't seen. Our main lesson: a near-perfect clean score can come from a shortcut in the dataset."

---

## 1. Problem and motivation

**Q1. What problem are you solving?**
Binary classification: given a URL, predict phishing (1) or legitimate (0) from the URL string alone, with no page fetch, DNS or WHOIS. The main question is whether the detector still works when an attacker deliberately changes the URL to evade it.

**Q2. Why not just use a blacklist like Google Safe Browsing?**
Blacklists are reactive. A URL is blocked only after someone has reported it, and phishing sites often live only a few hours. A small change to the URL (a new subdomain or one swapped character) also gives a URL the blacklist has never seen. An ML model generalises from patterns, so it can flag a URL it has never seen.

**Q3. Why does adversarial robustness matter here more than in, say, image classification?**
In phishing, the attacker controls the input. They own the domain, choose the subdomains and write the path. Changing a URL costs almost nothing (a free TLS cert, a DNS record). Evasion is the normal case in phishing, so testing only on clean data overstates real-world performance.

**Q4. What is the threat model?**
- **Attacker:** can edit the URL freely as long as it still leads to the phishing page (domain, subdomains, path, scheme, `@` user-info).
- **Defender:** sees only the URL string.
- Our attacks are **black-box and rule-based**. The attacker doesn't query the model.

**Q5. What does "lightweight" mean in this project?**
No page rendering, no deep packet inspection, no external lookups and no GPU. Inference takes about 13 µs per URL and the model file is about 3.8 MB, which is cheap enough for a browser extension or an email gateway.

---

## 2. The paper

**Q6. Summarise the paper in two lines.**
Chaudhuri & Mohankumar (Sci Rep 2026) propose AR-LRF, a bounded Random Forest (300 trees, depth 16, class-balanced) trained on clean plus adversarially perturbed URLs. They report 99.78% clean accuracy, and only a 6.58% accuracy drop under attack, compared with 14–24% for the baselines.

**Q7. What dataset did the paper use? Why didn't you use it?**
650k URLs: benign from Alexa/Tranco, phishing from OpenPhish/PhishTank, collected in 2024, with a 91:9 class imbalance. It is available only on request, so we used the public PhiUSIIL dataset (UCI #967) instead.

**Q8. What features did the paper use?**
12 features in four groups:
- **Lexical:** length, digits, special characters, entropy.
- **Structural:** HTTPS, IP-based URL, redirect count.
- **Encoding:** hex encoding, Unicode use.
- **Metadata:** domain age, Alexa rank, TLD.

We used 29 lexical/structural features and no metadata.

**Q9. What are the paper's two ways of generating adversarial samples?**
1. **URL-level transformations**: homoglyph, token padding, subdomain manipulation and encoding. The URL string is modified and features are re-extracted. This is the main method.
2. **Bounded feature noise**: x′ = x·(1+ε), ε ~ U(−δ, δ), δ = 0.1, with ‖x′−x‖₂ ≤ τ = 0.5. This is used for the sensitivity analysis.

We implemented only (1).

**Q10. Explain the paper's risk objective R(x) = λ₁L_cls + λ₂L_adv + λ₃C(x).**
It is a conceptual trade-off between three terms:
- L_cls: classification loss.
- L_adv: consistency between predictions on x and on the perturbed x′.
- C(x): computational cost.

A Random Forest doesn't minimise this function directly with gradients. In practice it is achieved through data augmentation (for L_adv) and bounded depth (for C). The paper does not give λ values.

**Q11. What did you find weak in the paper?** (Examiners love this one.)
- **No per-attack breakdown.** You can't tell which evasion hurts most.
- **Unequal capacity.** AR-LRF has 300 trees at depth 16, while the "fair" baseline RF-Full+Adv has 200 trees at depth 12. Part of the gain may be model size alone.
- **A suspicious coincidence.** The URL-level adversarial accuracy (93.2%, −6.58%) equals the feature-noise result at δ = 0.10 exactly. The paper doesn't explain this.
- **Metadata isn't URL-only.** Domain age and Alexa rank need external lookups, and Alexa rankings were retired in 2022.
- **No temporal split.** The data isn't public and the λ values aren't given.

**Q12. Did you reproduce the paper's result?**
- **Clean accuracy: yes.** 99.79% vs. their 99.78%.
- **Robustness: no, and the difference is informative.** Their attack families (homoglyph, padding, encoding, reordering) barely affected our model. A different attack (benign mimicry) broke it. The difference comes from the dataset: PhiUSIIL's legitimate URLs are all bare homepages.

---

## 3. Dataset

**Q13. Describe PhiUSIIL.**
Prasad & Chandra (Computers & Security, 2024), UCI #967. About 235k URLs with 50+ precomputed columns, including HTML/page features. We kept only `URL` and `label`.

| | Count |
|---|---|
| After exact-URL de-duplication | 235,370 |
| Phishing | 100,520 |
| Legitimate | 134,850 |

**Q14. Why did you flip the labels?**
In the original CSV, 1 = legitimate. We flipped it so that 1 = phishing, the class we want to catch. Then recall = phishing detection rate and precision = how trustworthy a "phishing" alert is, which matches how security people read these metrics.

**Q15. Why only the URL column? The dataset gives you 50+ features for free.**
Two reasons:
1. **Precomputed features don't respond to attacks.** If I change the URL, a precomputed `URLLength` column stays the same, so robustness can't be tested. Re-extracting features from the string makes an attacked URL produce a different feature vector.
2. **Many columns are page-content features** (lines of code, title, iframes), which break the "URL-only, lightweight" constraint.

**Q16. What is the dataset's "shortcut"?**
100% of legitimate URLs are `https://www.<domain>` with no path. Among phishing URLs, 49% use https, 42% have www and 27% have a path. A depth-3 decision tree on just `is_https`, `has_www` and `path_len` reaches **99.75% accuracy**. Most of the "intelligence" is the model learning the URL *shape*.

**Q17. How did you discover it?**
- Feature importance: `is_https` alone gets 41% of the RF's importance.
- Then the mimicry attack broke the model.
- Then we measured the shape of the URLs per class and trained the 3-feature tree to confirm it.

**Q18. Is the dataset balanced? Did you handle imbalance?**
It is 57:43 (phishing:legit), close enough to balanced, so we didn't use `class_weight`. The paper's data is 91:9, which is why they needed class balancing. With a 91:9 split, I'd use `class_weight="balanced"` or tune the threshold, and report PR-AUC.

**Q19. How did you handle duplicates and leakage?**
We dropped exact duplicate URLs *before* splitting, so the same URL can't appear in both train and test. We did **not** de-duplicate at the domain level, as the paper did. Two different URLs on the same phishing domain could fall into train and test, which may slightly inflate clean scores. That is an honest limitation.

**Q20. Is there a data-snooping risk because the attacks were designed after seeing the data?**
Benign mimicry was designed after noticing the legitimate-URL pattern, so in that sense yes. But that is also what a real attacker would do: look at what "legit" looks like and copy it. The attack uses no test labels and is applied the same way to every phishing URL.

---

## 4. Features

**Q21. Name your features.**
There are 29:
- **Lengths:** url, host, path, query.
- **Counts:** `.`, `-`, `_`, `/`, digits, special characters, percent-encodings, query params, subdomains, non-ASCII characters, host hyphens.
- **Ratios:** digit, letter, special, host-digit.
- **Flags:** `@`, IP host, port, https, www, punycode.
- **Other:** Shannon entropy, suspicious-keyword count, TLD length, longest token.

**Q22. What is Shannon entropy and why use it?**
H = −Σ pᵢ log₂ pᵢ over the characters in the string. It measures randomness. Machine-generated phishing domains (`dfuimiubaifhimoofmfpbmdjjedaaphs.top`) have higher entropy than human words. Empty string → 0, `"aaaa"` → 0, `"ab"` → 1 bit (all three are in the unit tests).

**Q23. Why the `@` feature?**
In `http://www.google.com@evil.com/`, everything before `@` is user-info, so the browser goes to `evil.com`. It is a classic phishing trick, and legitimate URLs essentially never contain it.

**Q24. Why do you strip the port and user-info before computing host features?**
To get the real host the browser connects to. `host = netloc.rsplit("@",1)[-1]`, then the `:port` is removed. Otherwise the obfuscation attack would let the attacker choose which "host" the model sees.

**Q25. Why no scaling for the Random Forest, but scaling for Logistic Regression?**
Trees split on thresholds of one feature at a time, so they don't depend on scale. LR uses gradient-based optimisation and L2 regularisation, both of which are scale-sensitive, so it's wrapped in `StandardScaler` in a pipeline. The scaler is fitted on training data only, so nothing leaks from the test set.

**Q26. Which features matter most?**
Baseline RF: `is_https` 0.41, `n_slashes` 0.15, `path_len` 0.12, `has_www` 0.075. About 76% of the importance is on URL shape. AR-LRF shifts a little weight to content (`n_special` 0.042 → 0.067, `digit_ratio`, `host_digit_ratio`), but the shortcut still dominates.

**Q27. What importance measure is that? Any caveats?**
Mean decrease in impurity (Gini importance), sklearn's default. Caveats:
- It is computed on training data.
- It is biased toward high-cardinality/continuous features.
- It splits credit between correlated features.

Permutation importance on the test set would be more trustworthy. That would be my next step.

---

## 5. Model: Random Forest

**Q28. How does a Random Forest work?**
- Train many decision trees, each on a **bootstrap sample** (rows sampled with replacement).
- At each split, consider only a **random subset of features** (√d by default for classification).
- Predict by averaging the trees' class probabilities (sklearn averages probabilities, not hard votes).

Bagging reduces variance, and feature subsampling decorrelates the trees, so averaging helps more.

**Q29. How does a decision tree choose a split?**
It picks the feature and threshold that maximise impurity reduction. Gini impurity = 1 − Σ pₖ². The tree grows greedily until a stopping rule applies (depth, min samples, or purity).

**Q30. What is out-of-bag (OOB) error?**
Each bootstrap sample leaves out about 36.8% of rows. Predicting each row using only the trees that didn't see it gives a free validation estimate. We didn't use it (we had a held-out test set), but `oob_score=True` would enable it.

**Q31. What is the difference between your baseline RF and AR-LRF?**

| | Trees | Depth | min_samples_leaf | Training data |
|---|---|---|---|---|
| Baseline RF | 100 | unlimited | 1 | clean only |
| AR-LRF | 100 | 20 | 2 | clean + one attacked copy of every training phishing URL (80,416 extra rows) |

**Q32. Why limit depth and leaf size?**
- Smaller, faster trees: the "lightweight" goal.
- Less overfitting to individual training URLs.

The ablation (bounded RF, no augmentation) showed that bounding alone gave **no** robustness gain. All of the gain came from augmentation.

**Q33. What is the bias–variance story here?**
Fully grown trees have low bias and high variance. Bagging many of them averages the variance away. Bounding depth adds a little bias. On this data it changed clean accuracy by less than 0.1%, so it was nearly free.

**Q34. Why did the bounded model train faster?**
Shallower trees mean fewer nodes to evaluate. AR-LRF trained in about 6 s even with 43% more rows, against about 24 s for the unbounded RF (from `metrics.json`).

---

## 6. Attacks

**Q35. List your attacks and what each does.**

| Attack | Example | What it targets |
|---|---|---|
| Homoglyph (ASCII) | paypal → paypa1 | digit count |
| Homoglyph (Unicode) | wikipedia → wikiреdiа (Cyrillic) | visual deception |
| Token padding | evil.com → secure-login-verify.evil.com | trust words |
| Encoding | /signin → /%73%69%67%6E%69%6E | hides keywords |
| Subdomain reorder | a.b.evil.com → b.a.evil.com | structure |
| Obfuscation (`@`) | `http://www.google.com@evil.com` | user-info trick |
| **Benign mimicry** | `http://evil.com/x` → `https://www.evil.com/x` | the legitimate-URL shape |
| Combined | Unicode homoglyph → reorder → mimicry | everything that reduces suspicion |

**Q36. Why apply attacks only to phishing URLs?**
Only phishers want to evade. Legitimate site owners have no reason to disguise their URLs. The legitimate test URLs stay unchanged, so precision on them still measures false alarms honestly.

**Q37. Why only the test set? And why also the training set for AR-LRF?**
- **Test set:** to measure evasion against a model that never saw the attack.
- **Training phishing URLs, for AR-LRF only:** that *is* adversarial training.

Test URLs are never used in training.

**Q38. Are the attacked URLs realistic? Would they still work?**
Mostly yes.
- Homoglyph, padding, reorder and mimicry only change parts of the URL the attacker controls (their own domain or subdomains).
- Encoding round-trips: `unquote(out) == url`, and this is unit-tested.
- The `@` trick is real, though modern browsers warn about it.
- Unicode homoglyphs: real browsers show mixed-script domains as punycode (`xn--...`). Our attack keeps raw Unicode, which is a simplification (see Q60).

**Q39. Why did five of the paper's attacks fail to hurt your model?**
They *add* characters: digits, subdomains, `%` signs or `@`. Every legitimate URL in PhiUSIIL is minimal, so added structure makes a URL look *more* like phishing. Token padding even raised recall to 100%. Obfuscation gave AUC = 1.0, because no legitimate URL has `@`.

**Q40. Why is benign mimicry so devastating?**
It sets the two most important features (`is_https`, `has_www`) to the "legitimate" values. For the 40% of phishing URLs with no path, it makes the URL's shape identical to a legitimate one. Recall fell from 99.6% to 63.6%: 7,319 of 20,104 phishing URLs were classed as legitimate. The cost to the attacker is a free Let's Encrypt cert and one DNS record.

**Q41. Why does accuracy drop less than recall under attack?**
Accuracy is computed over the whole test set (47,074 URLs), and the 26,970 legitimate URLs are unchanged and still classified correctly. Under mimicry, accuracy is 84.4% but recall is 63.6%. Recall is the honest metric for evasion.

**Q42. Why does "combined" behave so differently from mimicry for AR-LRF (95.4% vs 67.4%)?**
The Unicode homoglyph step leaves non-ASCII characters in the domain. AR-LRF learned during training that `n_non_ascii > 0` signals phishing (no legitimate URL has it). So the mimicked shape gets caught by that leftover trace. Pure mimicry leaves no trace.

**Q43. Why didn't you use gradient-based attacks like FGSM or PGD?**
Random Forests are not differentiable, so there are no gradients to follow. More importantly, feature-space attacks can produce vectors that no real URL could have (e.g. `url_len = 37.4` with `n_slashes = −1`). Problem-space attacks (editing the string, then re-extracting features) are always realisable, which is the paper's own argument for URL-level transforms.

**Q44. How would a stronger attacker beat you?**
- An **adaptive, query-based** attacker: try candidate edits, query the model and keep the cheapest one that flips the prediction (a greedy or genetic search over URL edits).
- A **brand-new domain** with a short, low-entropy, dictionary-word name plus mimicry would be almost undetectable lexically.

---

## 7. Adversarial training (AR-LRF)

**Q45. What exactly is your adversarial training procedure?**
For each training phishing URL, pick one of the 7 base attacks at random (seed 42), apply it, extract features and append the row with label 1. That adds 80,416 rows to 188,296 training rows. Then fit the bounded RF.

**Q46. Why one copy per URL with a random attack, instead of every attack on every URL?**
- It keeps the training set at about 1.4× instead of 8×, which saves time and memory.
- It keeps the class ratio from skewing heavily toward phishing (which would raise false positives).

Each attack still gets about 11.5k examples, which is plenty for a Random Forest.

**Q47. Why is "combined" not used in augmentation?**
So that "combined" is partly a test of **composition**: can a model trained on the individual pieces catch them chained together? Mostly yes (95.4%), thanks to the Unicode trace.

**Q48. What did the ablation show?**
The bounded RF without augmentation has the same recall as the baseline on every attack (e.g. 63.5% vs 63.6% under mimicry). All of AR-LRF's robustness comes from augmentation, not from bounding the forest.

**Q49. What is the cost of hardening?**
False positives on legitimate URLs rose from 13 to 61 out of 26,970 (FPR 0.05% → 0.23%), and precision fell from 0.9994 to 0.9970. Clean accuracy fell from 99.79% to 99.70%. That is a small cost, but at email-gateway scale 0.23% is a lot of blocked legitimate mail.

**Q50. What is leave-one-attack-out (LOAO) and what did it show?**
Retrain AR-LRF without attack A, then test on A. For mimicry, held-out recall was 63.9%, the same as no hardening (63.6%). **Adversarial training only protects against the perturbations it has seen.** The defender is always one step behind.

**Q51. Why can't mimicry be trained away?**
We trained a "mimicry-saturated" model on the mimicked version of *every* training phishing URL:

| Metric | Result |
|---|---|
| Recall on bare-domain phishing | 34.4% (vs. 9.2% for the baseline) |
| False-positive rate | 2.79% (12× higher than AR-LRF) |

Once phishing and legitimate URLs share the same shape, only the domain string is left, and lexical features (length, digits, entropy, TLD) can't reliably separate `dfuimiub…haphs.top` from `ecolabelindex.com`. This is a limit of the **feature space**, not the classifier.

**Q52. Is adversarial training the same as data augmentation?**
It is a specific kind: augmentation with worst-case or attacker-chosen perturbations, labelled with the *original* label. In deep learning it is usually done inside the training loop (e.g. PGD at each step). Ours is static, precomputed once, because the attacks are fixed rules and the model is a forest.

---

## 8. Evaluation and metrics

**Q53. Define precision, recall, F1, ROC-AUC.**
- **Precision** = TP/(TP+FP): of the URLs we flag, how many are really phishing.
- **Recall** = TP/(TP+FN): of all phishing URLs, how many we catch.
- **F1** = 2PR/(P+R): their harmonic mean.
- **ROC-AUC**: the probability that a random phishing URL scores higher than a random legitimate one. It measures ranking quality across all thresholds.

**Q54. Which metric matters most for you and why?**
**Recall under attack.** The attacker's goal is to make phishing look legitimate, which shows up as false negatives. Precision mostly stays high under attack because legitimate URLs aren't modified.

**Q55. Why might ROC-AUC mislead here?**
AUC summarises all thresholds, but you deploy one. Also, under attack the ROC curve shows that **no threshold** recovers the mimicked URLs without a large FPR. The problem is in the features, not the operating point.

**Q56. Why didn't you use cross-validation?**
One stratified 80/20 split with 47k test URLs already gives a tight estimate (the standard error on 99.8% accuracy is about 0.02%). The full pipeline, including LOAO (7 retrains), takes about 13 minutes, so 5-fold would take about 1 hour. The paper reports 5-fold CV. This is a fair criticism, and it is easy to add.

**Q57. Why not MCC or PR-AUC?**
They're most useful under heavy class imbalance. Our test set is 57:43, so accuracy and F1 aren't badly distorted. With the paper's 91:9 split I'd add both.

**Q58. Did you test statistical significance (like the paper's McNemar test)?**
No. For the attack results the effect sizes are huge (99.6% → 63.6% on 20k URLs), so significance is obvious. For the small clean-accuracy differences (99.79% vs 99.70%), McNemar's test would be the right tool, and I'd treat those differences as noise without it.

**Q59. What threshold did you use?**
0.5, the default. Lowering it for AR-LRF would catch more mimicry but raise FPR. The ROC curve shows the trade-off is poor.

---

## 9. Limitations and honesty questions

**Q60. Unicode homoglyphs: would a browser actually show `wikiреdiа.org`?**
Not usually. Chrome and Firefox show mixed-script IDNs as punycode (`xn--wiki-...`), and the HTTP Host header is always punycode. Our `has_punycode` feature exists, but our attack emits raw Unicode, so `n_non_ascii` is what fires. In practice the same signal would show up in punycode form instead. It is a simplification. The detection logic carries over.

**Q61. Would your 99.8% survive deployment?**
No. Real legitimate traffic includes deep links (`/account/settings?tab=2`), http-only sites and URLs without `www.`. The model would flag many of them because it learned "legitimate = bare https homepage." Expect a much higher FPR in production.

**Q62. What features would fix mimicry?**
- Domain age (WHOIS): new domains are suspicious.
- Certificate transparency logs (cert age and issuer).
- DNS reputation and passive DNS.
- Brand-similarity scores (edit distance to top brands).
- Page content or screenshot similarity.

All of these break the "lightweight, URL-only" constraint. That trade-off is the core tension.

**Q63. Is your AR-LRF the same as the paper's?**
No. It follows the paper's *description* (a bounded forest plus URL-level augmentation).

| | Ours | Paper |
|---|---|---|
| Trees | 100 | 300 |
| Depth | 20 | 16 |
| Class weighting | none | class-balanced |
| Feature noise (δ) | not implemented | used for sensitivity |
| Metadata features | not used | used |

**Q64. Is the paper wrong, then?**
Not necessarily. Their data comes from different sources (Alexa/Tranco), where legitimate URLs may vary more, so additive attacks could plausibly hurt there. Our finding is that **robustness results depend on the dataset**, and an evaluation should include attacks that target the *specific* shortcut the model has learned.

**Q65. What would you do with more time?**
1. Train on legitimate URLs with deep links (e.g. Common Crawl or Tranco plus paths).
2. Add domain age and certificate features.
3. Build an adaptive query-based attacker.
4. Use a temporal split (train on older URLs, test on newer).
5. Use permutation importance or SHAP.
6. Run 5-fold CV and McNemar's test.
7. De-duplicate at the domain level.

---

## 10. Code-level questions (the examiner opens the repo)

**Q66. Walk me through `experiment.py`.**
1. Load the data and featurize it.
2. Stratified split (seed 42).
3. Shortcut check (3-feature tree).
4. Clean baselines (LR, DT, RF).
5. Attack the phishing test URLs eight ways.
6. Train the bounded RF (ablation) and AR-LRF.
7. Evaluate 3 models × 9 scenarios.
8. LOAO (7 retrains).
9. Mimicry deep-dive (with the saturated model).
10. Demo predictions, feature importance, JSON/CSV output, saved models, plots.

**Q67. How do you build the attacked test set?**
Copy `X_te`, then overwrite **only the phishing rows** with features of the attacked URLs: `Xa.iloc[phish_te_pos] = featurize(adv).to_numpy()`. The legitimate rows are untouched.

**Q68. How does `_split_host` work, and why not a library?**
It splits the host into (subdomains, registered name, suffix). If the second-to-last label is in {com, co, org, net, gov, edu, ac, or, ne, go} and the last label is 2 letters, the suffix is two labels (`co.uk`, `org.br`). It is a heuristic in place of the full Public Suffix List. `tldextract` would be more accurate, but it fetches the PSL over the network on first use. See the architecture decisions doc.

**Q69. How is `subdomain_reordering` deterministic?**
It seeds `random.Random(f"{seed}:{url}")`, so the same URL always gets the same shuffle. It retries up to 5 times to make sure the order actually changes, and it keeps a leading `www` first.

**Q70. What happens with malformed URLs?**
`urlsplit` raises `ValueError` on things like broken IPv6 brackets. `features._split` falls back to a regex, and the attacks return the URL unchanged. Both paths are unit-tested (`test_malformed_url_does_not_crash`).

**Q71. What do your tests cover?**
`tests/test_attacks_features.py` covers:
- the feature-vector length;
- basic features (IP, port, query params, www);
- entropy edge cases;
- malformed input;
- homoglyphs touching only the domain;
- padding, and encoding round-tripping;
- reordering keeping the same labels;
- country-code suffixes;
- obfuscation and mimicry output.

They test behaviour on hand-written URLs, so they don't need the dataset.

**Q72. Why `float32` features?**
It halves memory compared with float64 (235k × 29 matrix). sklearn trees convert to float32 internally anyway.

**Q73. Why seed everything with 42?**
For reproducibility: the split, the RF bootstraps, the attack choice and the demo sample. Running it again gives the same numbers.

**Q74. How does `predict.py` work?**
It loads both saved models, featurizes the given URLs (plus every attacked variant if `--attacks` is passed), and prints the phishing probability and verdict from both models side by side. It forces UTF-8 stdout because the homoglyph variants contain Cyrillic letters.

---

## 10b. Web interface (short answers only)

**Q74a. What does the web app do?**
It's a front end for the same experiment. You can scan a URL with both models, see all 8 attacked versions of it side by side with the changed characters highlighted, and browse the results (robustness, features, method). It reads the models and results files that `experiment.py` already wrote. Nothing is retrained.

**Q74b. What is it built with?**
A FastAPI back end (`app/server.py`) with two endpoints, `GET /api/results` and `POST /api/scan`. The front end is plain HTML, CSS and JavaScript modules, with Three.js for the 3D plot. There is no React and no build step.

**Q74c. Does scanning visit the URL?**
No. It only reads the URL text, exactly like the model does, so scanning a phishing link is safe.

**Q74d. What is the 3D plot on the Overview tab?**
It shows 1,400 test URLs (700 of each class), squeezed from 29 features down to 3 with PCA. Before PCA, each feature is weighted by how important it is to the forest. The "After benign mimicry" toggle shows phishing points moving into the legitimate cluster. It is just a picture of the main finding.

**Q74e. How do you stop bad input?**
The server rejects empty input, URLs with spaces and anything over 2,048 characters (it returns a 422 error). If an attack crashes on a weird URL, that variant is left unchanged instead of failing the whole request.

**Q74f. Is the web app part of the research?**
No. It is for demos only. Every number in the report comes from `src/experiment.py`.

**Q74g. Where is it deployed?**
On Render's free tier, as a Docker container. The trained models live in a free Hugging Face model repo, and the build downloads them from one fixed version. The free tier sleeps after 15 minutes idle, so the first visit takes about a minute to wake up.

**Q74h. I typed `youtube.com/watch?v=...` and it says phishing. Why?**
That is the dataset shortcut showing up. Every legitimate URL the model trained on is a bare homepage, so it treats any URL with a path as suspicious. YouTube, GitHub login and the Python docs all score 1.00. It is limitation #1 in the report, and this is the easiest place to show it live.

---

## 11. Curveballs

**Q75. Your title says "AI". Isn't a Random Forest just statistics?**
It's machine learning, a core subfield of AI: the system learns a decision function from data instead of following hand-written rules. The adversarial part also brings in a game-theoretic AI element: an attacker and a defender adapting to each other.

**Q76. Why not use a deep model like CNN/LSTM/BERT on characters? Wouldn't it be more robust?**
- It would be heavier and slower, and the paper's goal is lightweight.
- It is less interpretable, and interpretability is how we found the shortcut.
- It is **not** obviously more robust. A character-level model trained on the same data would learn the same "https + www + no path = legitimate" shortcut. The weakness comes from the data, not the model.

**Q77. If the shortcut gives 99.75% with 3 features, why use 29?**
The other features carry the remaining signal. More importantly, they are what's left once an attacker neutralises the shortcut. Under mimicry, the 29 features catch 100% of phishing URLs that have a path. With only 3 features, recall would be close to 0.

**Q78. Isn't 99.8% accuracy suspicious in itself?**
Yes, and we treated it that way. Near-perfect scores on a security dataset usually mean leakage or a shortcut. We found the shortcut and quantified it.

**Q79. What is the difference between evasion and poisoning attacks?**
- **Evasion:** at test time, modify the input to fool a trained model. This is our case.
- **Poisoning:** at training time, inject bad samples into the training data. For example, an attacker could get phishing URLs labelled benign in a crowd-sourced feed.

**Q80. Could the attacker see your feature importances?**
If they did (white-box), they'd go straight for `is_https` and `has_www`, which is exactly mimicry. Even without access, a black-box attacker can guess "look like a normal homepage." Security through obscurity doesn't help much here.

**Q81. How would you deploy this?**
- **As a browser extension:** scoring takes microseconds and runs locally, and the URL never leaves the machine (which helps privacy).
- **As an email-gateway pre-filter:** flag suspicious links for deeper (slower) checks such as sandboxing or page analysis.

It works as a first-stage filter in a layered defence, not as the only defence.

**Q82. How would you handle concept drift?**
Retrain regularly on fresh feeds (OpenPhish/PhishTank). Monitor the score distribution and FPR over time. Evaluate on temporally held-out data to see how quickly performance decays.

**Q83. What did you personally learn?**
Evaluating a model on clean test data alone is not enough. The model's interpretability (Random Forest feature importance) made it possible to *find* the shortcut. Classical ML that you can inspect has real value in security.

---

## 12. Numbers cheat sheet

| Thing | Value |
|---|---|
| URLs after de-duplication | 235,370 (100,520 phishing / 134,850 legitimate) |
| Train / test | 188,296 / 47,074 (stratified 80/20, seed 42) |
| Phishing in the test set | 20,104 |
| Legitimate in the test set | 26,970 |
| Features | 29 lexical |
| Shortcut tree (3 features, depth 3) | 99.75% accuracy |
| Legitimate URLs: https / www / path | 100% / 100% / 0% |
| Phishing URLs: https / www / path | 49% / 42% / 27% |
| RF clean | accuracy 0.9979, precision 0.9994, recall 0.9958, F1 0.9976, AUC 0.9983 |
| Paper's AR-LRF clean | accuracy 0.9978 |
| RF inference | about 13 µs/URL |
| RF model size | 3.8 MB (AR-LRF 4.3 MB) |
| Mimicry recall, RF → AR-LRF | 0.636 → 0.674 |
| Combined recall, RF → AR-LRF | 0.636 → **0.954** |
| Mimicry AUC, RF → AR-LRF | 0.847 → 0.897 |
| AR-LRF false positives | 61 / 26,970 (0.23%), up from 13 (0.05%) |
| Adversarial training rows | 80,416 |
| LOAO: mimicry held out | 0.639 (no better than the unhardened 0.636) |
| Bare-domain share after mimicry | 40% |
| Recall on bare-domain phishing: RF / AR-LRF / saturated | 9.2% / 18.6% / 34.4% |
| Saturated model FPR | 2.79% |
| Top feature | `is_https`, 0.41 importance |
| Paper adversarial results | AR-LRF −6.58%, baselines −14 to −24% |
| Full pipeline runtime | about 13 minutes on a laptop CPU |
