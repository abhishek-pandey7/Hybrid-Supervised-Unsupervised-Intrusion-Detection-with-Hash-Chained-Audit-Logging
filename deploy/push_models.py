"""Upload the trained forests to a public Hugging Face model repo.

    hf auth login                                  # once
    python src/experiment.py                       # if models/ is missing
    python deploy/push_models.py [user/repo-name]  # default: <you>/ar-lrf-phishing-models

models/ is gitignored, so the Docker build (see Dockerfile) downloads the
models from this repo instead. It prints the commit hash to pin as
MODELS_REVISION in the Dockerfile.
"""
import sys
from pathlib import Path

from huggingface_hub import HfApi

MODELS = Path(__file__).resolve().parent.parent / "models"
FILES = ["rf_baseline.joblib", "ar_lrf.joblib"]


def main():
    api = HfApi()
    repo_id = sys.argv[1] if len(sys.argv) > 1 else f"{api.whoami()['name']}/ar-lrf-phishing-models"
    for f in FILES:
        if not (MODELS / f).exists():
            sys.exit(f"models/{f} is missing. Run `python src/experiment.py` first.")
    api.create_repo(repo_id, repo_type="model", exist_ok=True)
    info = api.upload_folder(folder_path=MODELS, repo_id=repo_id, allow_patterns=FILES,
                             commit_message="Upload baseline RF and AR-LRF")
    print(f"https://huggingface.co/{repo_id}")
    print(f"MODELS_REVISION={info.oid}")


if __name__ == "__main__":
    main()
