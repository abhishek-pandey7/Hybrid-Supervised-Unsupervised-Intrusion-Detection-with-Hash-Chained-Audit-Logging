"""String-level evasion attacks on phishing URLs.

Each attack takes a URL and returns a modified URL that a phishing operator
could plausibly deploy (they control the domain, the subdomains and the page
path). The attacks follow the evasion families named in the AR-LRF paper:
homoglyph substitution, token padding, encoding manipulation, subdomain
reordering and obfuscation, plus a "benign mimicry" attack aimed at the most
common pattern of legitimate URLs (https + www).

Attacks are applied to phishing URLs in the *test* set only (and, for the
hardened model, to a copy of the training phishing URLs).
"""
import random
import re
from urllib.parse import urlsplit, urlunsplit

ASCII_LOOKALIKES = {"o": "0", "l": "1", "i": "1"}
# Cyrillic characters that render identically to Latin ones (IDN homograph)
UNICODE_LOOKALIKES = {"a": "а", "e": "е", "o": "о", "p": "р", "c": "с"}


def _parts(url):
    try:
        return urlsplit(url)
    except ValueError:
        return None


def _replace_host(url, new_host):
    p = _parts(url)
    if p is None or not p.netloc:
        return url
    userinfo, _, hostport = p.netloc.rpartition("@")
    netloc = f"{userinfo}@{new_host}" if userinfo else new_host
    return urlunsplit((p.scheme, netloc, p.path, p.query, p.fragment))


def _host(url):
    p = _parts(url)
    return p.netloc.rpartition("@")[2] if p else ""


def _split_host(host):
    """-> (subdomain labels, registered name, tld). Port is kept on the tld."""
    labels = host.split(".")
    if len(labels) < 2:
        return [], host, ""
    return labels[:-2], labels[-2], labels[-1]


def homoglyph_ascii(url: str) -> str:
    """Swap letters in the domain for ASCII look-alikes: paypal -> paypa1, google -> g00g1e."""
    subs, name, tld = _split_host(_host(url))
    new = "".join(ASCII_LOOKALIKES.get(ch, ch) for ch in name)
    return _replace_host(url, ".".join(subs + [new, tld]).strip("."))


def homoglyph_unicode(url: str) -> str:
    """Swap Latin letters in the domain for visually identical Cyrillic letters."""
    subs, name, tld = _split_host(_host(url))
    new = "".join(UNICODE_LOOKALIKES.get(ch, ch) for ch in name)
    return _replace_host(url, ".".join(subs + [new, tld]).strip("."))


def token_padding(url: str) -> str:
    """Prepend a trust-word subdomain (secure-login-verify.<host>)."""
    return url.replace("://", "://secure-login-verify.", 1)


def encoding_manipulation(url: str) -> str:
    """Percent-encode every alphabetic character of the path (servers decode it back)."""
    p = _parts(url)
    if p is None or len(p.path) <= 1:
        return url
    enc = "".join(f"%{ord(ch):02X}" if ch.isascii() and ch.isalpha() else ch for ch in p.path)
    return urlunsplit((p.scheme, p.netloc, enc, p.query, p.fragment))


def subdomain_reordering(url: str, seed: int = 0) -> str:
    """Shuffle the subdomain labels (a.b.evil.com -> b.a.evil.com)."""
    subs, name, tld = _split_host(_host(url))
    if len(subs) < 2:
        return url
    rng = random.Random(f"{seed}:{url}")
    for _ in range(5):                      # make sure the order actually changes
        shuffled = subs[:]
        rng.shuffle(shuffled)
        if shuffled != subs:
            break
    return _replace_host(url, ".".join(shuffled + [name, tld]))


def obfuscation(url: str) -> str:
    """User-info trick: https://www.google.com@evil.com/... (browser goes to evil.com)."""
    return re.sub(r"^(\w+://)", r"\1www.google.com@", url, count=1)


def benign_mimicry(url: str) -> str:
    """Make the URL look like the typical legitimate URL: force https and a www. prefix."""
    p = _parts(url)
    if p is None or not p.netloc:
        return url
    host = p.netloc
    if not host.startswith("www.") and "@" not in host:
        host = "www." + host
    return urlunsplit(("https", host, p.path, p.query, p.fragment))


def combined(url: str) -> str:
    """Chain the attacks that make a URL look *less* suspicious."""
    return benign_mimicry(subdomain_reordering(homoglyph_unicode(url)))


ATTACKS = {
    "homoglyph_ascii": homoglyph_ascii,
    "homoglyph_unicode": homoglyph_unicode,
    "token_padding": token_padding,
    "encoding": encoding_manipulation,
    "subdomain_reorder": subdomain_reordering,
    "obfuscation": obfuscation,
    "benign_mimicry": benign_mimicry,
    "combined": combined,
}
