# Architecture Decisions

> The main design choices, why we made them, and what we rejected. Viva Q&A is in [VIVA_QUESTIONS.md](VIVA_QUESTIONS.md).

## Data and features

| Decision | Why | Why not the alternative |
|---|---|---|
| **PhiUSIIL dataset** | Public, large and recent; downloads straight from UCI | The paper's data is only available on request. Older datasets such as ISCX-2016 are dated. |
| **Use only the URL and label columns** | Features are recomputed from the URL, so an attacked URL produces a different feature vector | Precomputed columns don't change when the URL is attacked, and many need the page itself |
| **29 lexical features, URL text only** | Lightweight, works offline, and microseconds per URL | Domain age and Alexa rank need network lookups, and Alexa shut down in 2022 |
| **Flip labels so 1 = phishing** | Then recall means the phishing detection rate | Keeping the original labels makes every metric read backwards |
| **One stratified 80/20 split, seed 42** | 47,000 test URLs give tight estimates, and runs are reproducible | 5-fold cross-validation would take about 5× longer for the same conclusions |
| **No class weighting** | The data is 57:43, already close to balanced | The paper needs class weighting only because its data is 91:9 |

## Model

| Decision | Why | Why not the alternative |
|---|---|---|
| **Random Forest** | The paper's model; fast, no scaling needed, gives feature importances | XGBoost would learn the same shortcut. SVM is too slow on 188,000 rows. Deep learning is heavy, hard to inspect, and would learn the same shortcut. |
| **100 trees, depth 20** | Accuracy plateaus well before 100 trees, and leave-one-attack-out retrains the model 7 times | The paper's 300 trees cost 3× the time for about 0.01% |
| **A capped forest without augmentation, as an ablation** | Separates the effect of capping tree depth from the effect of adversarial training | Without it we couldn't say which change helped (answer: only adversarial training) |

## Attacks and hardening

| Decision | Why | Why not the alternative |
|---|---|---|
| **Edit the URL string, then recompute features** | Every attacked sample is a real URL an attacker could deploy | Feature-space noise or FGSM can create impossible URLs, and forests have no gradients |
| **Attack phishing URLs only** | Only phishers want to evade, so legitimate URLs stay untouched and false positives stay honest | Attacking legitimate URLs is a different threat |
| **Add "benign mimicry" (`https://www.`)** | It targets the shortcut the model actually learned | With only the paper's attacks we'd have wrongly concluded the model is robust |
| **One random attacked copy per training phishing URL** | Covers every attack with only 1.4× the data | Every attack on every URL means 8× the data and more false positives |
| **Leave-one-attack-out test** | Asks whether hardening helps against new attacks (it doesn't) | Testing only on attacks seen in training proves little |
| **Recall as the headline metric** | Evasion causes missed phishing URLs | Accuracy hides the damage (84% vs 64% recall under attack) |

## Engineering

| Decision | Why | Why not the alternative |
|---|---|---|
| **scikit-learn** | Classical models; one well-documented library | TensorFlow or PyTorch would add nothing here |
| **One script (`experiment.py`) produces every result** | Reproducible from a single command | Notebooks have hidden state and run out of order |
| **Simple public-suffix rule instead of `tldextract`** | No extra dependency and no network access needed | `tldextract` downloads its suffix list at runtime |
| **Pytest on features and attacks** | That's where a silent bug would invalidate the results | Tests that assert "accuracy > 0.99" depend on the data and fail randomly |

## Web app and deployment

| Decision | Why | Why not the alternative |
|---|---|---|
| **FastAPI back end** | Request validation built in, automatic API docs, small | Flask needs the validation written by hand. Streamlit gives no control over the layout. |
| **Plain JavaScript, no build step** | Nothing to install or compile, so less can break in a demo | React adds a build step that six tabs don't need |
| **Reuse `src/` and the saved models; never retrain** | The demo can't disagree with the report | Retraining on the server would be slow and could give different numbers |
| **Render free tier with Docker** | Free, and the app needs only about 170 MB of memory | Hugging Face Docker Spaces now require a paid plan |
| **Models in a Hugging Face model repo, pinned to one commit** | Keeps `models/` out of git, and the files can't silently change | Committing them to GitHub would mix model files in with the code |
| **Pinned library versions for deployment** | Saved forests only reliably load under the scikit-learn version that saved them (1.8.0) | Loose versions could break model loading |
