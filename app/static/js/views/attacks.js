import { h, fmt } from '../dom.js';
import { ATTACKS, MODELS, describeChar } from '../meta.js';
import {
  addressBar, sampleList, meter, sectionHead, nextStep, modelsMissing, emptyState, PHISH_THRESHOLD,
} from './shared.js';

export function mount(panel, ctx) {
  const { store, results, go } = ctx;
  const coverage = results.metrics.fraction_of_phishing_urls_modified;
  const { n_test: nTest, n_phishing: nPhish, n_urls: nUrls } = results.metrics.data;
  const testPhishing = Math.round((nTest * nPhish) / nUrls);
  const out = h('div', { class: 'stack' });
  let rendered = null;

  panel.append(
    h('section', { class: 'sheet glass' },
      sectionHead('Attack lab',
        'Eight rewrites an attacker can apply to a phishing URL without breaking the link. Each variant goes back through feature extraction and both models.', 'h1'),
      addressBar({ store, onSubmit: (u) => store.scan(u) }),
      sampleList({ onPick: (u) => store.scan(u) })),
    out,
    nextStep({
      text: `How do these attacks play out across all ${fmt.int(testPhishing)} phishing URLs in the test set?`,
      label: 'See robustness results', onClick: () => go('robustness'),
    }));

  store.subscribe((st) => {
    out.classList.toggle('is-stale', st.loading && !!st.result);
    if (!st.result) {
      if (!rendered) {
        out.replaceChildren(h('section', { class: 'sheet glass' }, emptyState('Pick a URL to attack',
          'Phishing URLs show the effect best. Try the first sample: paypal.com.secure-update.info/login.')));
      }
      return;
    }
    if (st.result === rendered) return;
    rendered = st.result;
    out.replaceChildren(...draw(st.result, coverage));
  });
}

function draw(res, coverage) {
  const ready = res.models_ready;
  const base = res.scores;
  const flagged = (p) => p >= PHISH_THRESHOLD;

  const outcome = (v) => {
    if (!v.changed) return { cls: 'neutral', text: 'No change for this URL' };
    if (!ready) return null;
    const lost = (k) => flagged(base[k]) && !flagged(v.scores[k]);
    const gained = (k) => !flagged(base[k]) && flagged(v.scores[k]);
    if (lost('rf') && lost('ar_lrf')) return { cls: 'bad', text: 'Fools both models' };
    if (lost('rf')) return { cls: 'accent', text: 'Fools the baseline only' };
    if (lost('ar_lrf')) return { cls: 'accent', text: 'Fools AR-LRF only' };
    if (gained('rf') || gained('ar_lrf')) {
      const who = gained('rf') && gained('ar_lrf') ? 'both models' : gained('rf') ? 'the baseline' : 'AR-LRF';
      return { cls: 'neutral', text: `Now flagged by ${who}` };
    }
    return { cls: 'neutral', text: 'No verdict change' };
  };

  const scoreCell = (scores) => h('div', { class: 'attack__scores' },
    ['rf', 'ar_lrf'].map((k) => {
      const m = MODELS[k];
      const p = scores?.[k];
      return h('div', { class: 'score' },
        h('span', { class: 'score__name' }, h('span', { class: `swatch swatch--${m.cls}`, 'aria-hidden': 'true' }), m.label),
        p == null ? h('span', { class: 'muted' }, '–') : [
          meter(p, m.cls, { size: 'sm', label: `${m.label}: ${fmt.pct(p)} chance of phishing` }),
          h('span', { class: `score__value num${flagged(p) ? ' is-flagged' : ''}` }, fmt.pct(p, 0)),
        ]);
    }));

  const changedVariants = res.variants.filter((v) => v.changed);
  const evades = (k) => changedVariants.filter((v) => flagged(base[k]) && !flagged(v.scores[k])).length;

  const summary = ready && h('div', { class: 'tally' },
    ['rf', 'ar_lrf'].map((k) => {
      const m = MODELS[k];
      return h('div', { class: 'tally__item' },
        h('p', { class: 'tally__value' }, flagged(base[k]) ? `${evades(k)} of ${res.variants.length}` : '–'),
        h('p', { class: 'tally__label' },
          h('span', { class: `swatch swatch--${m.cls}`, 'aria-hidden': 'true' }),
          flagged(base[k]) ? `attacks fool ${m.label}` : `${m.label} already lets the original through`));
    }));

  const original = h('li', { class: 'attack attack--original' },
    h('div', { class: 'attack__name' }, h('h3', {}, 'Original URL'),
      h('p', { class: 'muted small' }, 'The baseline for every comparison below.')),
    h('div', { class: 'attack__variant' }, h('p', { class: 'attack__url mono' }, res.url)),
    scoreCell(base),
    h('span'));

  const rows = res.variants.map((v) => {
    const meta = ATTACKS[v.attack];
    const o = outcome(v);
    return h('li', { class: `attack${v.changed ? '' : ' is-unchanged'}` },
      h('div', { class: 'attack__name' },
        h('h3', {}, meta.label),
        h('p', { class: 'small' }, meta.desc),
        h('p', { class: 'muted small' }, `Changes ${fmt.pct(coverage[v.attack], 0)} of phishing test URLs.`)),
      h('div', { class: 'attack__variant' },
        h('p', { class: 'attack__url mono' }, v.changed ? diffText(v.diff) : 'Same as the original'),
        v.changed && nonAsciiNote(v.url)),
      scoreCell(v.scores),
      o ? h('span', { class: `badge badge--${o.cls}` }, o.text) : h('span'));
  });

  return [
    h('section', { class: 'sheet glass' },
      sectionHead('Variants',
        'Changed characters are highlighted. A dotted underline marks a character that is not ASCII; hover it to see what it really is.'),
      !ready && modelsMissing(),
      summary,
      h('ul', { class: 'attack-list' }, original, rows)),
  ];
}

function diffText(segments) {
  return segments.map((seg) => {
    if (seg.op === 'equal') return seg.text;
    return h('mark', { class: 'diff' }, [...seg.text].map((ch) => (ch.codePointAt(0) > 127
      ? h('span', { class: 'nonascii', title: describeChar(ch) }, ch)
      : ch)));
  });
}

function nonAsciiNote(url) {
  const n = [...url].filter((ch) => ch.codePointAt(0) > 127).length;
  return n > 0 && h('p', { class: 'muted small' },
    `${n} ${n === 1 ? 'character is' : 'characters are'} not ASCII, though ${n === 1 ? 'it looks' : 'they look'} identical.`);
}
