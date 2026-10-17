# Viva Questions

> Short answers to the questions most likely to come up. The live demo script is in [DEMO.md](DEMO.md), and design choices are in [ARCHITECTURE_DECISIONS.md](ARCHITECTURE_DECISIONS.md).

## 30-second pitch

> "We replicated a 2026 Scientific Reports paper on lightweight phishing URL detection. Our Random Forest on 29 URL features reaches 99.79% accuracy, the same as the paper. When we attacked it, changing `http` to `https` let about a third of phishing URLs through, because every legitimate URL in the dataset is a bare `https://www` homepage. Adversarial training fixed attacks it had seen, but not that one. Our lesson: high clean accuracy can come from a dataset shortcut."

---

## The project

**1. What problem are you solving?**
We classify a URL as phishing or legitimate using only its text, then test whether the classifier still works when an attacker changes the URL.

**2. What's the point, if the model can be fooled?**
The project tests a claim. We matched the paper's accuracy, then showed that it comes from a shortcut and that a trivial attack defeats it. Finding where a method breaks is a real result.

**3. Why not just use a blacklist?**
Blacklists only block known URLs, and phishing sites often live only a few hours. An ML model can flag URLs it has never seen.

**4. What is the threat model?**
The attacker can edit any part of the URL they control. The defender sees only the URL text. Our attacks are fixed rules; the attacker doesn't query the model.

## Paper and data

**5. What does the paper propose?**
AR-LRF: a Random Forest with bounded tree depth, trained on clean URLs plus attacked copies of them (adversarial training). The paper reports 99.78% accuracy and only a 6.6% drop under attack.

**6. Why didn't you use the paper's dataset?**
It's only available on request. We used PhiUSIIL (UCI #967) instead: 235,370 unique URLs, 100,520 of them phishing.

**7. Why did you recompute the features instead of using the dataset's columns?**
Precomputed columns don't change when you edit the URL, so they can't be used to test attacks. Many of them also need the web page itself.

**8. What is the dataset shortcut?**
100% of legitimate URLs are `https://www.<domain>` with no path. A depth-3 tree using only https, www and path length gets 99.75% accuracy.

**9. Did you check for leakage?**
We removed exact duplicate URLs before splitting the data. We didn't remove duplicate domains, which is a limitation.

## Model

**10. Why a Random Forest?**
It's the paper's model. It is fast (about 13 µs per URL), works well on tabular data, and its feature importances revealed the shortcut.

**11. How does a Random Forest work?**
It trains many decision trees, each on a random sample of the rows and with a random subset of features at each split, then averages their predictions. This reduces overfitting.

**12. How is AR-LRF different from the baseline?**
Its trees are capped at depth 20 with at least 2 samples per leaf. It is trained on the clean data plus 80,416 attacked copies of the training phishing URLs.

**13. Did capping the tree depth help robustness?**
No. A capped forest without the attacked copies scores the same as the baseline. All the gain comes from adversarial training.

## Attacks and results

**14. Which attacks did you use?**
Two kinds of homoglyph (ASCII and Unicode), token padding, encoding, subdomain reordering, the `@` trick, benign mimicry (adding `https://www.`), and all of them combined.

**15. Why did most attacks fail?**
They add characters to the URL. Legitimate URLs in this dataset are minimal, so extra characters make a URL look more like phishing.

**16. What broke the model?**
Adding `https://www.`. Recall dropped from 99.6% to 63.6%. Changing `http` to `https` alone does almost all of that (66.0%); adding `www.` alone barely matters (98.7%).

**17. Which URLs slip through?**
Only phishing URLs with no path. URLs with a path, like `/login`, are still caught 100% of the time.

**18. Where did adversarial training help?**
It raised recall on the combined attack from 63.6% to 95.4%, and it catches Unicode look-alikes such as `wikiреdiа.org` (score 0.93, against 0.00 for the baseline).

**19. Why can't the https attack be trained away?**
After the attack, a phishing URL like `https://www.xyz.top` has the same shape as a legitimate one, and lexical features can't separate them. Even when trained on the attack for every phishing URL, the model catches only 34% of these URLs, and its false-positive rate rises to 2.8%.

**20. Does adversarial training generalise to attacks it hasn't seen?**
No. With mimicry left out of training, recall on mimicry was 63.9%, no better than the baseline.

**21. What did hardening cost?**
False positives rose from 13 to 61 out of 26,970 legitimate URLs (a false-positive rate of 0.23%).

## Metrics

**22. Why focus on recall?**
Evasion shows up as missed phishing URLs. Accuracy hides it: under mimicry accuracy is still 84%, because the legitimate test URLs aren't touched.

**23. Why no cross-validation?**
47,000 test URLs already give a tight estimate (about ±0.02%), and the attack effects are 30+ points. Cross-validation would be easy to add, and is a fair criticism.

## Limitations

**24. Would 99.8% survive in the real world?**
No. Real legitimate links have paths. YouTube, GitHub login and the Python docs all score 1.00 phishing in our demo.

**25. How would you fix it?**
Add domain age, certificate and DNS reputation features, train on legitimate deep links, and test against an adaptive attacker.

**26. Why not deep learning?**
It's heavier and harder to inspect, and it would learn the same shortcut. The problem is in the data, not the model.

## Web app

**27. What is the web app?**
It's a FastAPI server plus a plain-JavaScript front end that lets you scan and attack URLs live, using the same saved models. It's for demos only; all results come from `src/experiment.py`.

**28. Where is it hosted?**
On Render's free tier, using Docker. The models are downloaded from a pinned Hugging Face model repo when the image is built.

---

## Numbers to remember

| | |
|---|---|
| Data | 235,370 URLs; 188,296 train / 47,074 test; 29 features |
| Clean accuracy | RF 99.79% (paper: 99.78%) |
| Shortcut tree | 99.75% from 3 features |
| Recall: clean → `https://www.` | 99.6% → 63.6% (AR-LRF 67.4%) |
| `https` only / `www.` only | 66.0% / 98.7% |
| Combined attack | RF 63.6% → AR-LRF 95.4% |
| AR-LRF false-positive rate | 0.23% (up from 0.05%) |
| Top feature | `is_https`, 41% of importance |
| Speed / size | about 13 µs per URL, 3.8 MB |
