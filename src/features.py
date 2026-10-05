"""Lexical URL feature extraction.

All features are computed from the URL string alone, with no DNS, WHOIS or
page fetch. That keeps the detector lightweight and privacy-preserving (the
paper's design goal), and it means a string-level evasion directly moves the
feature vector.
"""
import math
import re
from collections import Counter
from urllib.parse import urlsplit

import numpy as np
import pandas as pd

SUSPICIOUS_WORDS = (
    "login", "signin", "verify", "account", "update", "secure", "bank",
    "confirm", "password", "wallet", "webscr", "ebayisapi", "support",
    "billing", "suspend", "unlock", "auth",
)
IPV4_RE = re.compile(r"^\d{1,3}(\.\d{1,3}){3}$")
TOKEN_SPLIT_RE = re.compile(r"[/\.\?=&\-_:@%]+")

FEATURE_NAMES = [
    "url_len", "host_len", "path_len", "query_len",
    "n_dots", "n_hyphens", "n_underscores", "n_slashes",
    "n_digits", "digit_ratio", "letter_ratio",
    "n_special", "special_ratio",
    "has_at", "host_is_ip", "has_port",
    "entropy",
    "n_subdomains", "is_https", "has_www",
    "n_query_params", "n_percent_enc",
    "n_suspicious_words", "tld_len", "longest_token",
    "n_non_ascii", "has_punycode", "host_digit_ratio",
    "host_hyphens",
]


def shannon_entropy(s: str) -> float:
    if not s:
        return 0.0
    n = len(s)
    return -sum(c / n * math.log2(c / n) for c in Counter(s).values())


def _split(url: str):
    try:
        parts = urlsplit(url)
        return parts.scheme.lower(), parts.netloc.lower(), parts.path, parts.query
    except ValueError:  # malformed (e.g. broken IPv6 brackets)
        m = re.match(r"^(\w+)://([^/?#]*)([^?#]*)\??(.*)", url)
        if m:
            return m.group(1).lower(), m.group(2).lower(), m.group(3), m.group(4)
        return "", "", url, ""


def extract(url: str) -> list:
    scheme, netloc, path, query = _split(url)
    host = netloc.rsplit("@", 1)[-1]          # strip any user-info part
    has_port = int(bool(re.search(r":\d+$", host)))
    host = re.sub(r":\d+$", "", host)
    labels = [l for l in host.split(".") if l]

    n = len(url) or 1
    n_digits = sum(ch.isdigit() for ch in url)
    n_letters = sum(ch.isalpha() for ch in url)
    n_special = sum(not ch.isalnum() for ch in url)
    lowered = url.lower()

    return [
        len(url), len(host), len(path), len(query),
        url.count("."), url.count("-"), url.count("_"), url.count("/"),
        n_digits, n_digits / n, n_letters / n,
        n_special, n_special / n,
        int("@" in url), int(bool(IPV4_RE.match(host))), has_port,
        shannon_entropy(url),
        max(len(labels) - 2, 0), int(scheme == "https"), int(host.startswith("www.")),
        query.count("&") + 1 if query else 0, url.count("%"),
        sum(w in lowered for w in SUSPICIOUS_WORDS),
        len(labels[-1]) if labels else 0,
        max((len(t) for t in TOKEN_SPLIT_RE.split(url) if t), default=0),
        sum(ord(ch) > 127 for ch in url), int("xn--" in host),
        sum(ch.isdigit() for ch in host) / (len(host) or 1),
        host.count("-"),
    ]


def featurize(urls) -> pd.DataFrame:
    X = np.array([extract(u) for u in urls], dtype=np.float32)
    return pd.DataFrame(X, columns=FEATURE_NAMES)
