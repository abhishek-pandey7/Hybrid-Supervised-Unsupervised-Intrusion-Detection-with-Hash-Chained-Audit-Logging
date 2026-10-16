import { h, fmt, segmented } from '../dom.js';
import { barChart } from '../charts.js';
import { FEATURES, FEATURE_GROUPS } from '../meta.js';
import { sectionHead, nextStep } from './shared.js';

export function mount(panel, ctx) {
  const { results, go } = ctx;
  const m = results.metrics;
  const d = m.data;
  const shape = m.url_shape_by_class;
  const shortcut = m.shortcut_3_features;

  const stats = [
    [fmt.int(d.n_urls), 'unique URLs in PhiUSIIL'],
    [fmt.int(d.n_phishing), `phishing (${fmt.pct(d.n_phishing / d.n_urls)})`],
    [fmt.int(d.n_legit), 'legitimate'],
    [`${fmt.int(d.n_train)} / ${fmt.int(d.n_test)}`, 'train / test, stratified 80/20'],
  ];

  const shapeRows = [
    ['uses https', 'Uses https://'],
    ['has www.', 'Starts with www.'],
    ['has a path', 'Has a path after the domain'],
  ];
  const shapeTable = h('div', { class: 'shape', role: 'table', 'aria-label': 'URL shape by class' },
    h('div', { class: 'shape__row shape__row--head', role: 'row' },
      h('span', { role: 'columnheader' }, 'Share of URLs that…'),
      h('span', { role: 'columnheader' }, 'Legitimate'),
      h('span', { role: 'columnheader' }, 'Phishing')),
    shapeRows.map(([key, label]) => h('div', { class: 'shape__row', role: 'row' },
      h('span', { role: 'cell', class: 'shape__label' }, label),
      ['legitimate', 'phishing'].map((cls) => h('span', { role: 'cell', class: 'shape__cell' },
        h('span', { class: 'shape__bar', 'aria-hidden': 'true' }, h('span', { style: { width: `${shape[cls][key] * 100}%` } })),
        h('span', { class: 'num' }, fmt.pct(shape[cls][key], 0)))))));

  // feature importance
  const imp = results.feature_importance;
  let showAll = false;
  const chartEl = h('div');
  const categories = () => (showAll ? imp : imp.slice(0, 15)).map((r) => ({ key: r.feature, label: FEATURES[r.feature].label }));
  const byFeature = new Map(imp.map((r) => [r.feature, r]));
  const chart = barChart(chartEl, {
    categories: categories(),
    series: [
      { key: 'rf', label: 'Random Forest (baseline)', cls: 'rf' },
      { key: 'ar_lrf', label: 'AR-LRF (hardened)', cls: 'ar' },
    ],
    value: (f, k) => byFeature.get(f)[k],
    max: 0.45,
    ticks: [0, 0.1, 0.2, 0.3, 0.4],
    format: (v) => fmt.pct(v),
    tickFormat: (t) => `${Math.round(t * 100)}%`,
    labelFormat: (v) => fmt.pct(v, 0),
    labelWhen: (v) => v >= 0.05,
    orientation: 'h',
    categoryHeader: 'Feature',
    ariaLabel: 'Horizontal bar chart of feature importance for both forests',
  });

  const countControl = segmented({
    label: 'Features shown', value: 'top', size: 'sm',
    options: [{ value: 'top', label: 'Top 15' }, { value: 'all', label: 'All 29' }],
    onChange: (v) => {
      showAll = v === 'all';
      chart.update({ categories: categories() });
    },
  });
  const viewControl = segmented({
    label: 'View', value: 'chart', size: 'sm',
    options: [{ value: 'chart', label: 'Chart' }, { value: 'table', label: 'Table' }],
    onChange: (v) => chart.setView(v),
  });

  const top4 = imp.slice(0, 4).reduce((a, r) => a + r.rf, 0);

  const dictionary = h('div', { class: 'dictionary' }, Object.entries(FEATURE_GROUPS).map(([g, title]) =>
    h('section', {},
      h('h3', {}, title),
      h('dl', {}, Object.entries(FEATURES).filter(([, f]) => f.group === g).map(([name, f]) => [
        h('dt', {}, f.label, ' ', h('code', {}, name)),
        h('dd', {}, f.desc),
      ])))));

  panel.append(
    h('section', { class: 'sheet glass' },
      sectionHead('The dataset', 'PhiUSIIL (UCI #967), de-duplicated. Only the raw URL string and its label are used; every feature is re-computed from the string.', 'h1'),
      h('dl', { class: 'statline' }, stats.map(([v, label]) => h('div', {}, h('dt', {}, label), h('dd', {}, v))))),
    h('section', { class: 'sheet glass' },
      sectionHead('Every legitimate URL has the same shape',
        'In PhiUSIIL, legitimate URLs are a bare https://www.<domain> with no path. Phishing URLs vary. That single regularity is what benign mimicry exploits.'),
      shapeTable,
      h('p', { class: 'callout' },
        h('strong', {}, fmt.pct(shortcut.accuracy, 2)),
        ' accuracy from a depth-3 decision tree that sees only three features: https, www and path length. '
        + `The full 29-feature forest reaches ${fmt.pct(m.clean['Random Forest'].accuracy, 2)}.`)),
    h('section', { class: 'sheet glass' },
      sectionHead('What the forests rely on',
        `Share of each forest’s total importance (mean decrease in impurity). The top four features carry ${fmt.pct(top4, 0)} of the baseline’s.`),
      h('div', { class: 'toolbar' }, countControl, viewControl),
      chartEl),
    h('section', { class: 'sheet glass' },
      sectionHead('All 29 features', 'Computed from the URL text only: no DNS, WHOIS or page fetch, which keeps the detector fast and private.'),
      dictionary),
    nextStep({
      text: 'See how the pipeline is put together and how to reproduce every number here.',
      label: 'Open Method', onClick: () => go('method'),
    }));
}
