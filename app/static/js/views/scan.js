import { h, fmt } from '../dom.js';
import { icon } from '../icons.js';
import { FEATURES, MODELS, formatFeature } from '../meta.js';
import {
  addressBar, sampleList, meter, verdict, sectionHead, nextStep, modelsMissing, emptyState, PHISH_THRESHOLD,
} from './shared.js';

const TOP_FEATURES = 10;

export function mount(panel, ctx) {
  const { store, results, go } = ctx;
  const importance = new Map(results.feature_importance.map((r) => [r.feature, r]));
  const maxImportance = Math.max(...results.feature_importance.map((r) => r.ar_lrf));
  const out = h('div', { class: 'stack' });
  let rendered = null;
  let showAll = false;

  panel.append(
    h('section', { class: 'sheet glass' },
      sectionHead('Scan a URL',
        'Both models read only the text of the address. Nothing is fetched or opened, so live phishing links are safe to paste here.', 'h1'),
      addressBar({ store, onSubmit: (u) => store.scan(u) }),
      sampleList({ onPick: (u) => store.scan(u) })),
    out,
    nextStep({
      text: 'Could an attacker rewrite this URL so the models let it through?',
      label: 'Open the Attack lab', onClick: () => go('attacks'),
    }));

  store.subscribe((st) => {
    out.classList.toggle('is-stale', st.loading && !!st.result);
    if (!st.result) {
      if (!rendered) {
        out.replaceChildren(h('section', { class: 'sheet glass' }, emptyState('No URL scanned yet',
          'Paste one above or pick a sample. You will see where the link really goes, how each model scores it, and the 29 numbers they read.')));
      }
      return;
    }
    if (st.result === rendered) return;
    rendered = st.result;
    draw(st.result);
  });

  function draw(res) {
    out.replaceChildren(anatomySheet(res), verdictSheet(res), featuresSheet(res));
  }

  function featuresSheet(res) {
    const rows = [...res.features].sort((a, b) => importance.get(b.name).ar_lrf - importance.get(a.name).ar_lrf);
    const list = h('div', { class: 'features', role: 'table', 'aria-label': 'Features of this URL' });
    const toggle = h('button', { type: 'button', class: 'btn btn--ghost btn--sm' });
    const renderRows = () => {
      const shown = showAll ? rows : rows.slice(0, TOP_FEATURES);
      list.replaceChildren(
        h('div', { class: 'features__row features__row--head', role: 'row' },
          h('span', { role: 'columnheader' }, 'Feature'),
          h('span', { role: 'columnheader', class: 'num' }, 'This URL'),
          h('span', { role: 'columnheader' }, 'Weight in AR-LRF')),
        ...shown.map((f) => {
          const meta = FEATURES[f.name];
          const w = importance.get(f.name).ar_lrf;
          return h('div', { class: 'features__row', role: 'row' },
            h('span', { role: 'cell', class: 'features__name' },
              h('span', {}, meta.label), h('code', {}, f.name)),
            h('span', { role: 'cell', class: 'num features__value' }, formatFeature(f.name, f.value)),
            h('span', { role: 'cell', class: 'features__weight' },
              h('span', { class: 'weightbar', 'aria-hidden': 'true' },
                h('span', { class: 'fill-bg--ar', style: { width: `${(w / maxImportance) * 100}%` } })),
              h('span', { class: 'num' }, fmt.pct(w))));
        }));
      toggle.textContent = showAll ? `Show the top ${TOP_FEATURES}` : `Show all ${rows.length} features`;
    };
    toggle.addEventListener('click', () => {
      showAll = !showAll;
      renderRows();
    });
    renderRows();
    return h('section', { class: 'sheet glass' },
      sectionHead('What the models measured',
        'Every number is computed from the URL string alone. Rows are ordered by how much AR-LRF relies on each feature.'),
      list,
      h('div', { class: 'sheet__actions' }, toggle));
  }
}

function anatomySheet(res) {
  const parts = res.anatomy;
  const kinds = new Set(parts.map((p) => p.kind));
  const registered = registeredDomain(parts);

  // the dot between domain and suffix belongs to the highlighted registered domain
  const kindAt = (i) => (parts[i].kind === 'sep' && parts[i - 1]?.kind === 'domain' && parts[i + 1]?.kind === 'suffix'
    ? 'domain-sep' : parts[i].kind);
  const url = h('p', { class: 'anatomy' }, parts.map((p, i) => h('span', { class: `part part--${kindAt(i)}` }, p.text)));

  const keys = [];
  if (kinds.has('domain')) keys.push(['domain', 'Registered domain', 'where the page is actually hosted']);
  if (kinds.has('subdomain')) keys.push(['subdomain', 'Subdomains', 'chosen freely by whoever owns the domain']);
  if (kinds.has('userinfo')) keys.push(['userinfo', 'User info', 'ignored by the browser']);

  return h('section', { class: 'sheet glass' },
    sectionHead('Where this link goes'),
    url,
    h('ul', { class: 'anatomy-key' }, keys.map(([k, name, text]) =>
      h('li', {}, h('span', { class: `part part--${k} anatomy-key__sample` }, name), ` ${text}`))),
    registered && h('p', { class: 'destination' }, 'Opens a page on ', h('strong', { class: 'mono' }, registered), '.'),
    res.scheme_added && h('p', { class: 'note' }, icon('info', { size: 16 }),
      'No scheme was given, so the URL was scanned as https://. The models were trained on full URLs.'));
}

function registeredDomain(parts) {
  const i = parts.findIndex((p) => p.kind === 'domain');
  if (i === -1) return '';
  let text = parts[i].text;
  if (parts[i + 1]?.kind === 'sep' && parts[i + 2]?.kind === 'suffix') text += '.' + parts[i + 2].text;
  return text;
}

function verdictSheet(res) {
  if (!res.models_ready) {
    return h('section', { class: 'sheet glass' }, sectionHead('Verdict'), modelsMissing());
  }
  const { rf, ar_lrf: ar } = res.scores;
  const card = (key, p) => {
    const m = MODELS[key];
    return h('div', { class: 'model-card well' },
      h('div', { class: 'model-card__head' },
        h('span', { class: `swatch swatch--${m.cls}`, 'aria-hidden': 'true' }),
        h('strong', {}, m.label), h('span', { class: 'muted' }, m.role)),
      h('p', { class: 'model-card__value' }, fmt.pct(p), h('span', {}, 'chance of phishing')),
      meter(p, m.cls, { size: 'lg', label: `${m.label}: ${fmt.pct(p)} chance of phishing` }),
      h('div', { class: 'model-card__foot' }, verdict(p), h('span', { class: 'muted small' }, 'Threshold 50%')));
  };
  const a = rf >= PHISH_THRESHOLD;
  const b = ar >= PHISH_THRESHOLD;
  const agreement = a && b ? 'Both models flag this URL.'
    : !a && !b ? 'Both models let this URL through.'
      : b ? 'Only the hardened model flags this URL.' : 'Only the baseline flags this URL.';
  const feature = (name) => res.features.find((f) => f.name === name).value;
  const offShape = feature('is_https') < 0.5 || feature('has_www') < 0.5;
  return h('section', { class: 'sheet glass' },
    sectionHead('Verdict', agreement),
    h('div', { class: 'model-grid' }, card('rf', rf), card('ar_lrf', ar)),
    offShape && (a || b) && h('p', { class: 'note' }, icon('info', { size: 16 }),
      'Every legitimate URL the models trained on starts with https://www., so a URL without that prefix is flagged almost by default. Features & data explains why.'));
}
