"""Download and load the PhiUSIIL Phishing URL dataset (UCI id 967).

Only the raw URL string and the label are used: every feature is re-extracted
from the URL in features.py so that adversarial edits to the URL actually
change the feature vector the model sees.
"""
from pathlib import Path
import io
import zipfile

import pandas as pd
import requests

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data"
CSV_PATH = DATA_DIR / "PhiUSIIL_Phishing_URL_Dataset.csv"
UCI_URL = "https://archive.ics.uci.edu/static/public/967/phiusiil+phishing+url+dataset.zip"


def download(force: bool = False) -> Path:
    if CSV_PATH.exists() and not force:
        return CSV_PATH
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    print(f"Downloading PhiUSIIL from {UCI_URL} ...")
    resp = requests.get(UCI_URL, timeout=120)
    resp.raise_for_status()
    with zipfile.ZipFile(io.BytesIO(resp.content)) as zf:
        zf.extractall(DATA_DIR)
    return CSV_PATH


def load() -> pd.DataFrame:
    """Return a de-duplicated frame with columns `url` and `phishing` (1 = phishing).

    In the original CSV, label 1 means *legitimate* and 0 means *phishing*.
    We flip it so that the positive class is the one we want to catch, which
    makes recall = phishing detection rate.
    """
    download()
    df = pd.read_csv(CSV_PATH, usecols=["URL", "label"], encoding="utf-8-sig")
    df = df.rename(columns={"URL": "url"})
    df["phishing"] = (df.pop("label") == 0).astype(int)
    df = df.drop_duplicates(subset="url").reset_index(drop=True)
    return df


if __name__ == "__main__":
    d = load()
    print(d.shape)
    print(d.phishing.value_counts())
