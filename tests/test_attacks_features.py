import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "src"))

import attacks as A
from features import FEATURE_NAMES, extract, featurize, shannon_entropy


def feat(url):
    return dict(zip(FEATURE_NAMES, extract(url)))


def test_feature_vector_length():
    assert len(extract("https://www.example.com")) == len(FEATURE_NAMES)
    assert featurize(["http://a.b", "https://x.y/z"]).shape == (2, len(FEATURE_NAMES))


def test_basic_features():
    f = feat("http://192.168.0.1:8080/login.php?a=1&b=2")
    assert f["host_is_ip"] == 1 and f["has_port"] == 1
    assert f["is_https"] == 0 and f["n_query_params"] == 2
    assert f["n_suspicious_words"] >= 1
    assert feat("https://www.example.com")["has_www"] == 1


def test_entropy():
    assert shannon_entropy("") == 0
    assert shannon_entropy("aaaa") == 0
    assert abs(shannon_entropy("ab") - 1.0) < 1e-9


def test_malformed_url_does_not_crash():
    extract("http://[broken/ipv6")
    for fn in A.ATTACKS.values():
        fn("http://[broken/ipv6")


def test_homoglyphs_touch_domain_only():
    url = "http://login.paypal.com/account/login"
    assert A.homoglyph_ascii(url) == "http://login.paypa1.com/account/login"
    out = A.homoglyph_unicode(url)
    assert out.startswith("http://login.") and out.endswith(".com/account/login")
    assert "paypal" not in out and feat(out)["n_non_ascii"] > 0


def test_token_padding():
    assert A.token_padding("http://evil.com/x") == "http://secure-login-verify.evil.com/x"


def test_encoding_round_trips():
    from urllib.parse import unquote
    url = "http://evil.com/signin/index.html?x=1"
    out = A.encoding_manipulation(url)
    assert "%" in out and unquote(out) == url


def test_subdomain_reorder_keeps_labels():
    url = "https://a.b.c.evil.com/p"
    out = A.subdomain_reordering(url)
    assert out != url and out.endswith(".evil.com/p")
    assert sorted(out[8:].split(".evil")[0].split(".")) == ["a", "b", "c"]
    assert A.subdomain_reordering("https://evil.com/") == "https://evil.com/"


def test_obfuscation_and_mimicry():
    assert A.obfuscation("http://evil.com/x") == "http://www.google.com@evil.com/x"
    assert A.benign_mimicry("http://evil.com/x") == "https://www.evil.com/x"
    assert A.benign_mimicry("https://www.evil.com") == "https://www.evil.com"
