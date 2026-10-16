// Human-readable names for everything the Python side reports by identifier.

export const MODELS = {
  rf: { label: 'Random Forest', role: 'Baseline', key: 'Random Forest (baseline)', cls: 'rf' },
  lrf: { label: 'LRF', role: 'Bounded, no augmentation', key: 'LRF (bounded, no aug.)', cls: 'lrf' },
  ar_lrf: { label: 'AR-LRF', role: 'Adversarially hardened', key: 'AR-LRF (hardened)', cls: 'ar' },
};

export const ATTACKS = {
  homoglyph_ascii: {
    label: 'Homoglyph (ASCII)', short: 'Homoglyph\nASCII',
    desc: 'Swaps domain letters for look-alike digits: o becomes 0, l and i become 1.',
  },
  homoglyph_unicode: {
    label: 'Homoglyph (Unicode)', short: 'Homoglyph\nUnicode',
    desc: 'Replaces a, e, o, p and c in the domain with Cyrillic letters that render identically.',
  },
  token_padding: {
    label: 'Token padding', short: 'Token\npadding',
    desc: 'Prepends a trust-word subdomain, secure-login-verify.',
  },
  encoding: {
    label: 'Encoding', short: 'Encoding',
    desc: 'Percent-encodes every letter of the path. Servers decode it back to the same page.',
  },
  subdomain_reorder: {
    label: 'Subdomain reorder', short: 'Subdomain\nreorder',
    desc: 'Shuffles the subdomain labels. Needs at least two subdomains to do anything.',
  },
  obfuscation: {
    label: 'Obfuscation (@ trick)', short: 'Obfuscation\n@ trick',
    desc: 'Puts www.google.com@ before the host. Browsers read it as a username and still open the real host.',
  },
  benign_mimicry: {
    label: 'Benign mimicry', short: 'Benign\nmimicry',
    desc: 'Forces https:// and a www. prefix, the exact shape of every legitimate URL in the dataset.',
  },
  combined: {
    label: 'Combined', short: 'Combined',
    desc: 'Unicode homoglyphs, then subdomain reorder, then benign mimicry.',
  },
};

export const SCENARIOS = { clean: { label: 'Clean', short: 'Clean' }, ...ATTACKS };

// kind: count | ratio | bool | bits
export const FEATURES = {
  url_len: { label: 'URL length', group: 'length', kind: 'count', desc: 'Total characters in the URL.' },
  host_len: { label: 'Host length', group: 'length', kind: 'count', desc: 'Characters in the host name.' },
  path_len: { label: 'Path length', group: 'length', kind: 'count', desc: 'Characters in the path after the host.' },
  query_len: { label: 'Query length', group: 'length', kind: 'count', desc: 'Characters after the question mark.' },
  tld_len: { label: 'Top-level domain length', group: 'length', kind: 'count', desc: 'Characters in the last label of the host, such as com or info.' },
  longest_token: { label: 'Longest token', group: 'length', kind: 'count', desc: 'Longest run of characters between separators such as / . ? = & -' },

  n_dots: { label: 'Dots', group: 'chars', kind: 'count', desc: 'Number of . characters.' },
  n_hyphens: { label: 'Hyphens', group: 'chars', kind: 'count', desc: 'Number of - characters.' },
  n_underscores: { label: 'Underscores', group: 'chars', kind: 'count', desc: 'Number of _ characters.' },
  n_slashes: { label: 'Slashes', group: 'chars', kind: 'count', desc: 'Number of / characters, including the two after the scheme.' },
  n_digits: { label: 'Digits', group: 'chars', kind: 'count', desc: 'Number of digit characters.' },
  digit_ratio: { label: 'Digit share', group: 'chars', kind: 'ratio', desc: 'Digits as a share of all characters.' },
  letter_ratio: { label: 'Letter share', group: 'chars', kind: 'ratio', desc: 'Letters as a share of all characters.' },
  n_special: { label: 'Special characters', group: 'chars', kind: 'count', desc: 'Characters that are neither letters nor digits.' },
  special_ratio: { label: 'Special-character share', group: 'chars', kind: 'ratio', desc: 'Special characters as a share of all characters.' },
  entropy: { label: 'Character entropy', group: 'chars', kind: 'bits', desc: 'Shannon entropy of the characters. Random-looking strings score higher.' },
  n_percent_enc: { label: 'Percent signs', group: 'chars', kind: 'count', desc: 'Number of % characters, a sign of percent-encoding.' },
  n_non_ascii: { label: 'Non-ASCII characters', group: 'chars', kind: 'count', desc: 'Characters outside ASCII, such as Cyrillic look-alikes.' },

  n_subdomains: { label: 'Subdomains', group: 'host', kind: 'count', desc: 'Host labels beyond the registered domain and suffix.' },
  has_www: { label: 'Starts with www.', group: 'host', kind: 'bool', desc: 'The host begins with www.' },
  host_is_ip: { label: 'Host is an IP address', group: 'host', kind: 'bool', desc: 'A raw IPv4 address instead of a domain name.' },
  has_port: { label: 'Explicit port', group: 'host', kind: 'bool', desc: 'The host ends in a port number such as :8080.' },
  has_punycode: { label: 'Punycode host', group: 'host', kind: 'bool', desc: 'The host contains xn--, the ASCII form of an international domain.' },
  host_digit_ratio: { label: 'Digit share in host', group: 'host', kind: 'ratio', desc: 'Digits as a share of the host name.' },
  host_hyphens: { label: 'Hyphens in host', group: 'host', kind: 'count', desc: 'Number of - characters in the host name.' },
  has_at: { label: 'Contains @', group: 'host', kind: 'bool', desc: 'An @ makes browsers ignore everything before it in the host.' },

  is_https: { label: 'Uses HTTPS', group: 'request', kind: 'bool', desc: 'The scheme is https.' },
  n_query_params: { label: 'Query parameters', group: 'request', kind: 'count', desc: 'Number of key=value pairs after the question mark.' },
  n_suspicious_words: { label: 'Trust words', group: 'request', kind: 'count', desc: 'Matches for login, verify, account, secure, bank, password and 11 similar words.' },
};

export const FEATURE_GROUPS = {
  length: 'Length',
  chars: 'Characters',
  host: 'Host',
  request: 'Scheme and query',
};

export function formatFeature(name, value) {
  const kind = FEATURES[name]?.kind;
  if (kind === 'bool') return value >= 0.5 ? 'Yes' : 'No';
  if (kind === 'ratio') return `${(value * 100).toFixed(1)}%`;
  if (kind === 'bits') return `${value.toFixed(2)} bits`;
  return Math.round(value).toLocaleString('en-US');
}

export const SAMPLES = [
  { url: 'http://paypal.com.secure-update.info/login', note: 'Brand name hidden in a subdomain' },
  { url: 'http://www.institutohumanus.org.br', note: 'Phishing URL from the test set' },
  { url: 'http://buttery-almond-scar.glitch.me/vaewa.htm', note: 'Phishing URL from the test set' },
  { url: 'https://www.wikipedia.org', note: 'Legitimate' },
];

const CONFUSABLE = { 'а': 'a', 'е': 'e', 'о': 'o', 'р': 'p', 'с': 'c', 'х': 'x', 'у': 'y', 'і': 'i' };

export function describeChar(ch) {
  const code = 'U+' + ch.codePointAt(0).toString(16).toUpperCase().padStart(4, '0');
  const latin = CONFUSABLE[ch];
  return latin ? `Cyrillic "${ch}" (${code}), not the Latin letter "${latin}"` : `Non-ASCII character ${code}`;
}
