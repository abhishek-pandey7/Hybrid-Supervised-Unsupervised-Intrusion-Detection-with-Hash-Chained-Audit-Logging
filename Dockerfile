# Web UI (app/) for free hosting on Render; see render.yaml and docs/DEMO.md.
#   docker build -t ar-lrf . && docker run -p 7860:7860 ar-lrf
FROM python:3.12-slim

RUN useradd -m -u 1000 user
USER user
ENV HOME=/home/user PATH=/home/user/.local/bin:$PATH PYTHONUNBUFFERED=1
WORKDIR /home/user/app

COPY --chown=user deploy/requirements.txt .
RUN pip install --no-cache-dir --user -r requirements.txt

# models/ is gitignored: fetch the trained forests from the Hugging Face model repo
# (uploaded by deploy/push_models.py), pinned to one commit so the files can't change
ARG MODELS_REPO=abhshkp/ar-lrf-phishing-models
ARG MODELS_REVISION=8f8435d584c8485b899cf7b26ea0d3129d6a7bcc
RUN mkdir models && python -c "import urllib.request as u; \
[u.urlretrieve(f'https://huggingface.co/${MODELS_REPO}/resolve/${MODELS_REVISION}/{f}', f'models/{f}') \
 for f in ('rf_baseline.joblib', 'ar_lrf.joblib')]"

COPY --chown=user src/attacks.py src/features.py src/
COPY --chown=user results/ results/
COPY --chown=user app/ app/

EXPOSE 7860
# Render sets $PORT; default to 7860 locally
CMD ["sh", "-c", "uvicorn server:app --app-dir app --host 0.0.0.0 --port ${PORT:-7860}"]
