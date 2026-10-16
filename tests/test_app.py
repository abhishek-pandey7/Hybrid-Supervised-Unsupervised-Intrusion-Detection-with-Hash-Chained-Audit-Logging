import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "app"))

import server  # noqa: E402

URLS = [
    "http://paypal.com.secure-update.info/login",
    "https://www.wikipedia.org",
    "http://192.168.0.1:8080/login.php?a=1#frag?x",
    "https://user:pw@www.google.com@evil.co.uk:8443/a/b?c=d",
    "http://[broken/ipv6",
    "https://www.wikiреdiа.org",
]


@pytest.mark.parametrize("url", URLS)
def test_anatomy_joins_back_to_the_url(url):
    assert "".join(p["text"] for p in server.anatomy(url)) == url


def test_anatomy_labels():
    kinds = {p["kind"]: p["text"] for p in server.anatomy("http://login.paypal.com.secure-update.info/login?x=1")}
    assert kinds["domain"] == "secure-update" and kinds["suffix"] == "info"
    assert kinds["path"] == "/login" and kinds["query"] == "?x=1"
    at = {p["kind"]: p["text"] for p in server.anatomy("https://www.google.com@evil.com/")}
    assert at["userinfo"] == "www.google.com" and at["domain"] == "evil"
    ip = server.anatomy("http://10.0.0.1/x")
    assert [p["text"] for p in ip if p["kind"] == "domain"] == ["10.0.0.1"]


def test_diff_marks_only_changed_characters():
    segs = server.diff("http://paypal.com", "http://paypa1.com")
    assert "".join(s["text"] for s in segs) == "http://paypa1.com"
    assert [s["text"] for s in segs if s["op"] == "changed"] == ["1"]


def test_scan_endpoint():
    pytest.importorskip("httpx")
    from fastapi.testclient import TestClient

    client = TestClient(server.app)
    res = client.post("/api/scan", json={"url": "paypal.com.secure-update.info/login"})
    assert res.status_code == 200
    body = res.json()
    assert body["url"].startswith("https://") and body["scheme_added"]
    assert len(body["features"]) == 29
    assert {v["attack"] for v in body["variants"]} == set(server.ATTACKS)
    if body["models_ready"]:
        assert 0 <= body["scores"]["rf"] <= 1 and 0 <= body["scores"]["ar_lrf"] <= 1

    assert client.post("/api/scan", json={"url": "   "}).status_code == 422
    assert client.post("/api/scan", json={"url": "a b"}).status_code == 422
    assert client.post("/api/scan", json={"url": "x" * 5000}).status_code == 422
