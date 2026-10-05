"""Clean -> attacked -> hardened experiment.

1. Load PhiUSIIL, extract lexical features, stratified 80/20 split.
2. Dataset-bias check: how far do three "URL shape" features get on their own?
3. Clean evaluation of LR / Decision Tree / Random Forest baselines.
4. Apply each evasion attack to the phishing URLs of the test set and re-evaluate.
5. Harden: AR-LRF = depth-limited Random Forest trained on clean data plus
   attacked copies of the training phishing URLs. Re-evaluate on every attack.
6. Leave-one-attack-out: harden without attack A, test on A (generalisation).
7. Write metrics (results/*.json, *.csv), figures (results/figures) and models.
"""
import json
import random
import sys
import time
from pathlib import Path

import joblib
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (accuracy_score, confusion_matrix, f1_score,
                             precision_score, recall_score, roc_auc_score,
                             roc_curve)
from sklearn.model_selection import train_test_split
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.tree import DecisionTreeClassifier

sys.path.insert(0, str(Path(__file__).resolve().parent))
import data
from attacks import ATTACKS
from features import FEATURE_NAMES, featurize

SEED = 42
RESULTS = data.ROOT / "results"
FIGS = RESULTS / "figures"
MODELS = data.ROOT / "models"
BASE_ATTACKS = [a for a in ATTACKS if a != "combined"]   # used for augmentation

# reference categorical palette (dataviz skill, light mode)
BLUE, ORANGE, AQUA = "#2a78d6", "#eb6834", "#1baf7a"
INK, INK2, GRID = "#0b0b0b", "#52514e", "#e6e5e0"
plt.rcParams.update({
    "font.size": 10, "axes.edgecolor": GRID, "axes.labelcolor": INK2,
    "xtick.color": INK2, "ytick.color": INK2, "axes.titlecolor": INK,
    "axes.spines.top": False, "axes.spines.right": False,
    "axes.grid": True, "grid.color": GRID, "grid.linewidth": 0.8,
    "axes.axisbelow": True, "figure.dpi": 130, "savefig.bbox": "tight",
    "legend.frameon": False,
})


def metrics(y, proba, thr=0.5):
    pred = (proba >= thr).astype(int)
    out = {
        "accuracy": accuracy_score(y, pred),
        "precision": precision_score(y, pred, zero_division=0),
        "recall": recall_score(y, pred, zero_division=0),
        "f1": f1_score(y, pred, zero_division=0),
    }
    out["roc_auc"] = roc_auc_score(y, proba) if len(set(y)) > 1 else float("nan")
    return {k: round(float(v), 4) for k, v in out.items()}


def make_rf():
    return RandomForestClassifier(n_estimators=100, n_jobs=-1, random_state=SEED)


def make_ar_lrf():
    # "lightweight": a bounded ensemble (depth/leaf limits keep it small and fast)
    return RandomForestClassifier(n_estimators=100, max_depth=20, min_samples_leaf=2,
                                  n_jobs=-1, random_state=SEED)


def augment(urls, attack_names, seed=SEED):
    """One attacked copy per phishing URL, attack picked at random."""
    rng = random.Random(seed)
    return [ATTACKS[rng.choice(attack_names)](u) for u in urls]


def fit_hardened(X_tr, y_tr, phish_tr_urls, attack_names):
    adv_urls = augment(phish_tr_urls, attack_names)
    X_adv = featurize(adv_urls)
    X_aug = pd.concat([X_tr, X_adv], ignore_index=True)
    y_aug = np.concatenate([y_tr, np.ones(len(X_adv), dtype=int)])
    model = make_ar_lrf()
    t = time.perf_counter()
    model.fit(X_aug, y_aug)
    return model, time.perf_counter() - t, len(X_adv)


def main():
    RESULTS.mkdir(exist_ok=True); FIGS.mkdir(exist_ok=True); MODELS.mkdir(exist_ok=True)
    report = {}

    # ---------------------------------------------------------------- data
    df = data.load()
    print(f"{len(df):,} unique URLs | phishing={df.phishing.sum():,} legit={(df.phishing == 0).sum():,}")
    t = time.perf_counter()
    X = featurize(df.url)
    print(f"feature extraction: {time.perf_counter() - t:.1f}s")
    y = df.phishing.to_numpy()
    idx_tr, idx_te = train_test_split(np.arange(len(df)), test_size=0.2, stratify=y, random_state=SEED)
    X_tr, X_te, y_tr, y_te = X.iloc[idx_tr], X.iloc[idx_te], y[idx_tr], y[idx_te]
    urls_tr, urls_te = df.url.iloc[idx_tr].tolist(), df.url.iloc[idx_te].tolist()
    report["data"] = {"n_urls": int(len(df)), "n_phishing": int(y.sum()), "n_legit": int((y == 0).sum()),
                      "n_train": int(len(idx_tr)), "n_test": int(len(idx_te)), "n_features": len(FEATURE_NAMES)}

    # ------------------------------------------------------ dataset bias
    shape = pd.DataFrame({
        "uses https": X.is_https.to_numpy(), "has www.": X.has_www.to_numpy(),
        "has a path": (X.path_len > 1).to_numpy(), "phishing": y})
    bias = shape.groupby("phishing").mean().rename(index={0: "legitimate", 1: "phishing"})
    report["url_shape_by_class"] = bias.round(4).to_dict(orient="index")
    shortcut_cols = ["is_https", "has_www", "path_len"]
    stump = DecisionTreeClassifier(max_depth=3, random_state=SEED).fit(X_tr[shortcut_cols], y_tr)
    report["shortcut_3_features"] = metrics(y_te, stump.predict_proba(X_te[shortcut_cols])[:, 1])
    print("shortcut (https/www/path only):", report["shortcut_3_features"])

    # ------------------------------------------------------ clean baselines
    clean = {}
    baselines = {
        "Logistic Regression": make_pipeline(StandardScaler(), LogisticRegression(max_iter=2000)),
        "Decision Tree": DecisionTreeClassifier(max_depth=15, random_state=SEED),
        "Random Forest": make_rf(),
    }
    fitted = {}
    for name, model in baselines.items():
        t = time.perf_counter(); model.fit(X_tr, y_tr); fit_s = time.perf_counter() - t
        t = time.perf_counter(); p = model.predict_proba(X_te)[:, 1]; pred_s = time.perf_counter() - t
        clean[name] = {**metrics(y_te, p), "train_s": round(fit_s, 2),
                       "us_per_url": round(pred_s / len(X_te) * 1e6, 2)}
        fitted[name] = model
        print(f"clean {name:20s}", clean[name])
    rf = fitted["Random Forest"]
    report["clean"] = clean

    # ------------------------------------------------------ attacks
    phish_te_pos = np.where(y_te == 1)[0]
    phish_te_urls = [urls_te[i] for i in phish_te_pos]
    attacked_X = {"clean": X_te}
    changed = {}
    for name, fn in ATTACKS.items():
        adv = [fn(u) for u in phish_te_urls]
        changed[name] = round(float(np.mean([a != u for a, u in zip(adv, phish_te_urls)])), 4)
        Xa = X_te.copy()
        Xa.iloc[phish_te_pos] = featurize(adv).to_numpy()
        attacked_X[name] = Xa
    report["fraction_of_phishing_urls_modified"] = changed

    # ------------------------------------------------------ hardening
    phish_tr_urls = [u for u, lab in zip(urls_tr, y_tr) if lab == 1]
    lrf = make_ar_lrf().fit(X_tr, y_tr)        # ablation: bounded RF, no augmentation
    ar_lrf, fit_s, n_adv = fit_hardened(X_tr, y_tr, phish_tr_urls, BASE_ATTACKS)
    report["ar_lrf"] = {"train_s": round(fit_s, 2), "n_adversarial_train_samples": n_adv,
                        "augmentation_attacks": BASE_ATTACKS,
                        "params": {"n_estimators": 100, "max_depth": 20, "min_samples_leaf": 2}}

    models = {"Random Forest (baseline)": rf, "LRF (bounded, no aug.)": lrf, "AR-LRF (hardened)": ar_lrf}
    rows, probas = [], {}
    for scen, Xs in attacked_X.items():
        for mname, m in models.items():
            p = m.predict_proba(Xs)[:, 1]
            probas[(mname, scen)] = p
            rows.append({"scenario": scen, "model": mname, **metrics(y_te, p)})
    robust = pd.DataFrame(rows)
    robust.to_csv(RESULTS / "robustness.csv", index=False)
    report["robustness"] = robust.to_dict(orient="records")
    print(robust.pivot(index="scenario", columns="model", values="recall").to_string())

    # ------------------------------------------------------ leave-one-attack-out
    loao = []
    for held in BASE_ATTACKS:
        m, _, _ = fit_hardened(X_tr, y_tr, phish_tr_urls, [a for a in BASE_ATTACKS if a != held])
        r = recall_score(y_te, m.predict(attacked_X[held]))
        loao.append({"attack": held, "recall_held_out": round(float(r), 4)})
        print(f"LOAO {held:18s} recall={r:.4f}")
    report["leave_one_attack_out"] = loao

    # ------------------------------------------------------ mimicry deep-dive
    # After mimicry many phishing URLs are a bare https://www.<domain>, exactly the
    # shape of every legitimate URL, so only the domain string itself is left to judge.
    Xm = attacked_X["benign_mimicry"].iloc[phish_te_pos]
    bare = ((Xm.path_len == 0) & (Xm.query_len == 0)).to_numpy()
    legit_te = X_te.iloc[np.where(y_te == 0)[0]]
    mimic_tr = featurize([ATTACKS["benign_mimicry"](u) for u in phish_tr_urls])
    saturated = make_ar_lrf().fit(pd.concat([X_tr, mimic_tr], ignore_index=True),
                                  np.concatenate([y_tr, np.ones(len(mimic_tr), dtype=int)]))
    deep = {"share_bare_domain_after_mimicry": round(float(bare.mean()), 4)}
    for mname, m in [("Random Forest (baseline)", rf), ("AR-LRF (hardened)", ar_lrf),
                     ("Mimicry-saturated LRF", saturated)]:
        p = m.predict(Xm)
        deep[mname] = {"recall_bare_domain": round(float(p[bare].mean()), 4),
                       "recall_with_path": round(float(p[~bare].mean()), 4),
                       "recall_overall": round(float(p.mean()), 4),
                       "clean_recall": round(float(m.predict(X_te.iloc[phish_te_pos]).mean()), 4),
                       "false_positive_rate": round(float(m.predict(legit_te).mean()), 4)}
    report["mimicry_deep_dive"] = deep
    print("mimicry deep-dive:", json.dumps(deep, indent=1))

    # ------------------------------------------------------ demo predictions
    rng = np.random.default_rng(SEED)
    demo_urls = [phish_te_urls[i] for i in rng.choice(len(phish_te_urls), 4, replace=False)]
    demo_urls += ["http://paypal.com.secure-update.info/login", "https://www.wikipedia.org"]
    demo = []
    for u in demo_urls:
        for scen in ["clean", "benign_mimicry", "homoglyph_unicode", "combined"]:
            v = u if scen == "clean" else ATTACKS[scen](u)
            f = featurize([v])
            demo.append({"url": v if len(v) < 90 else v[:87] + "...", "attack": scen,
                         "p_phish_rf": round(float(rf.predict_proba(f)[0, 1]), 3),
                         "p_phish_ar_lrf": round(float(ar_lrf.predict_proba(f)[0, 1]), 3)})
    pd.DataFrame(demo).to_csv(RESULTS / "demo_predictions.csv", index=False)

    # ------------------------------------------------------ feature importance
    imp = pd.DataFrame({"feature": FEATURE_NAMES, "rf": rf.feature_importances_,
                        "ar_lrf": ar_lrf.feature_importances_}).sort_values("rf", ascending=False)
    imp.round(4).to_csv(RESULTS / "feature_importance.csv", index=False)

    (RESULTS / "metrics.json").write_text(json.dumps(report, indent=2))
    joblib.dump({"model": rf, "features": FEATURE_NAMES}, MODELS / "rf_baseline.joblib", compress=3)
    joblib.dump({"model": ar_lrf, "features": FEATURE_NAMES}, MODELS / "ar_lrf.joblib", compress=3)

    plot_all(robust, probas, y_te, imp, loao, bias, clean)
    print("done ->", RESULTS)


# =========================================================== plotting
SCEN_LABEL = {"clean": "Clean", "homoglyph_ascii": "Homoglyph\n(ASCII)", "homoglyph_unicode": "Homoglyph\n(Unicode)",
              "token_padding": "Token\npadding", "encoding": "Encoding", "subdomain_reorder": "Subdomain\nreorder",
              "obfuscation": "Obfuscation\n(@ trick)", "benign_mimicry": "Benign\nmimicry", "combined": "Combined"}


def _bars(ax, groups, series, colors, labels, width=0.38):
    x = np.arange(len(groups))
    n = len(series)
    for i, (vals, c, lab) in enumerate(zip(series, colors, labels)):
        off = (i - (n - 1) / 2) * width
        ax.bar(x + off, vals, width - 0.04, color=c, label=lab, zorder=2)
    ax.set_xticks(x)
    ax.set_xticklabels([SCEN_LABEL.get(g, g) for g in groups])


def plot_all(robust, probas, y_te, imp, loao, bias, clean):
    rec = robust.pivot(index="scenario", columns="model", values="recall")
    order = ["clean"] + list(ATTACKS)
    rec = rec.loc[order]

    # 1. headline: clean vs attacked vs hardened (phishing recall)
    fig, ax = plt.subplots(figsize=(12, 4.6))
    _bars(ax, order, [rec["Random Forest (baseline)"], rec["AR-LRF (hardened)"]], [BLUE, ORANGE],
          ["Random Forest (baseline)", "AR-LRF (adversarially hardened)"])
    for i, s in enumerate(order):
        b, h = rec.loc[s, "Random Forest (baseline)"], rec.loc[s, "AR-LRF (hardened)"]
        if b < 0.9:
            ax.annotate(f"{b:.2f}", (i - 0.19, b), ha="center", va="bottom", fontsize=8, color=INK2,
                        xytext=(0, 2), textcoords="offset points")
            ax.annotate(f"{h:.2f}", (i + 0.19, h), ha="center", va="bottom", fontsize=8, color=INK2,
                        xytext=(0, 2), textcoords="offset points")
    ax.set_ylim(0, 1.08); ax.set_ylabel("Phishing recall (detection rate)")
    ax.set_title("Clean vs attacked vs hardened: phishing recall on the test set", loc="left", pad=26)
    ax.grid(axis="x", visible=False)
    ax.legend(loc="lower left", bbox_to_anchor=(0, 1.0), ncol=2)
    fig.savefig(FIGS / "clean_vs_attacked_vs_hardened.png"); plt.close(fig)

    # 2. F1 for all three models across scenarios
    f1 = robust.pivot(index="scenario", columns="model", values="f1").loc[order]
    fig, ax = plt.subplots(figsize=(12, 4.2))
    _bars(ax, order, [f1["Random Forest (baseline)"], f1["LRF (bounded, no aug.)"], f1["AR-LRF (hardened)"]],
          [BLUE, AQUA, ORANGE], ["Random Forest (baseline)", "LRF (bounded, no augmentation)", "AR-LRF (hardened)"],
          width=0.28)
    ax.set_ylim(0, 1.05); ax.set_ylabel("F1-score")
    ax.set_title("Ablation: bounding the forest alone vs bounding + adversarial training", loc="left", pad=26)
    ax.grid(axis="x", visible=False); ax.legend(loc="lower left", bbox_to_anchor=(0, 1.0), ncol=3)
    fig.savefig(FIGS / "f1_ablation.png"); plt.close(fig)

    # worst attack for the baseline
    worst = rec["Random Forest (baseline)"].drop("clean").idxmin()

    # 3. confusion matrices
    fig, axes = plt.subplots(1, 4, figsize=(16, 3.8), gridspec_kw={"wspace": 0.35})
    combos = [("Random Forest (baseline)", "clean"), ("Random Forest (baseline)", worst),
              ("AR-LRF (hardened)", "clean"), ("AR-LRF (hardened)", worst)]
    from matplotlib.colors import LinearSegmentedColormap
    cmap = LinearSegmentedColormap.from_list("blues", ["#f4f8fd", "#86b6ef", "#2a78d6", "#0d366b"])
    for ax, (m, s) in zip(axes, combos):
        cm = confusion_matrix(y_te, (probas[(m, s)] >= 0.5).astype(int))
        norm = cm / cm.sum(axis=1, keepdims=True)
        ax.imshow(norm, cmap=cmap, vmin=0, vmax=1)
        for (i, j), v in np.ndenumerate(cm):
            ax.text(j, i, f"{v:,}\n({norm[i, j]:.1%})", ha="center", va="center", fontsize=9,
                    color="white" if norm[i, j] > 0.55 else INK)
        ax.set_xticks([0, 1], ["legit", "phishing"]); ax.set_yticks([0, 1], ["legit", "phishing"])
        ax.set_xlabel("Predicted"); ax.set_ylabel("Actual" if ax is axes[0] else ""); ax.grid(False)
        ax.set_title(f"{m.split(' (')[0]} | {SCEN_LABEL[s].replace(chr(10), ' ')}", fontsize=10, loc="left")
    fig.suptitle(f"Confusion matrices: clean test set vs worst attack ({SCEN_LABEL[worst].replace(chr(10), ' ')})",
                 x=0.01, y=1.06, ha="left", color=INK)
    fig.savefig(FIGS / "confusion_matrices.png"); plt.close(fig)

    # 4. ROC curves
    fig, ax = plt.subplots(figsize=(6.2, 5))
    for (m, s), c, ls in [(combos[0], BLUE, "-"), (combos[1], BLUE, "--"),
                          (combos[2], ORANGE, "-"), (combos[3], ORANGE, "--")]:
        fpr, tpr, _ = roc_curve(y_te, probas[(m, s)])
        auc = roc_auc_score(y_te, probas[(m, s)])
        ax.plot(fpr, tpr, color=c, ls=ls, lw=2,
                label=f"{m.split(' (')[0]}, {SCEN_LABEL[s].replace(chr(10), ' ')} (AUC {auc:.3f})")
    ax.plot([0, 1], [0, 1], color=GRID, lw=1)
    ax.set_xlabel("False positive rate"); ax.set_ylabel("True positive rate")
    ax.set_title("ROC curves (dashed = under worst attack)", loc="left")
    ax.legend(loc="lower right", fontsize=8.5)
    fig.savefig(FIGS / "roc_curves.png"); plt.close(fig)

    # 5. feature importance
    top = imp.head(15).iloc[::-1]
    fig, ax = plt.subplots(figsize=(8, 5.6))
    yy = np.arange(len(top))
    ax.barh(yy + 0.2, top.rf, 0.36, color=BLUE, label="Random Forest (baseline)")
    ax.barh(yy - 0.2, top.ar_lrf, 0.36, color=ORANGE, label="AR-LRF (hardened)")
    ax.set_yticks(yy, top.feature); ax.grid(axis="y", visible=False)
    ax.set_xlabel("Mean decrease in impurity")
    ax.set_title("Top-15 feature importances", loc="left"); ax.legend(loc="lower right")
    fig.savefig(FIGS / "feature_importance.png"); plt.close(fig)

    # 6. leave-one-attack-out
    lo = pd.DataFrame(loao).set_index("attack")
    names = list(lo.index)
    fig, ax = plt.subplots(figsize=(11, 4.2))
    _bars(ax, names, [rec.loc[names, "Random Forest (baseline)"], lo.recall_held_out,
                      rec.loc[names, "AR-LRF (hardened)"]],
          [BLUE, AQUA, ORANGE], ["Baseline RF (no augmentation)", "AR-LRF, attack held out of training",
                                 "AR-LRF, attack seen in training"], width=0.28)
    ax.set_ylim(0, 1.05); ax.set_ylabel("Phishing recall under attack")
    ax.set_title("Does hardening generalise to an attack it never saw?", loc="left", pad=26)
    ax.grid(axis="x", visible=False); ax.legend(loc="lower left", bbox_to_anchor=(0, 1.0), ncol=3)
    fig.savefig(FIGS / "leave_one_attack_out.png"); plt.close(fig)

    # 7. dataset bias
    fig, ax = plt.subplots(figsize=(7, 3.6))
    cols = list(bias.columns)
    x = np.arange(len(cols))
    ax.bar(x - 0.19, bias.loc["legitimate"], 0.34, color=BLUE, label="legitimate")
    ax.bar(x + 0.19, bias.loc["phishing"], 0.34, color=ORANGE, label="phishing")
    for i, c in enumerate(cols):
        for off, cls in [(-0.19, "legitimate"), (0.19, "phishing")]:
            ax.annotate(f"{bias.loc[cls, c]:.0%}", (i + off, bias.loc[cls, c]), ha="center", va="bottom",
                        fontsize=8.5, color=INK2, xytext=(0, 2), textcoords="offset points")
    ax.set_xticks(x, cols); ax.set_ylim(0, 1.12); ax.set_ylabel("Share of URLs")
    ax.yaxis.set_major_formatter(matplotlib.ticker.PercentFormatter(1.0))
    ax.grid(axis="x", visible=False); ax.legend(loc="lower left", bbox_to_anchor=(0, 1.0), ncol=2)
    ax.set_title("PhiUSIIL URL shape by class", loc="left", pad=26)
    fig.savefig(FIGS / "dataset_url_shape.png"); plt.close(fig)


if __name__ == "__main__":
    main()
