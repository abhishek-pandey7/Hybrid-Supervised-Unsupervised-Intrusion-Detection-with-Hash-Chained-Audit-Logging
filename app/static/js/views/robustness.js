import { h, fmt, segmented } from '../dom.js';
import { barChart } from '../charts.js';
import { MODELS, SCENARIOS, ATTACKS } from '../meta.js';
import { sectionHead, nextStep } from './shared.js';

const METRICS = {
  recall: { label: 'Recall', desc: 'Share of phishing URLs caught. Attacks target this one.' },
  f1: { label: 'F1', desc: 'Balance of precision and recall.' },
  accuracy: { label: 'Accuracy', desc: 'Share of all test URLs classified correctly.' },
  precision: { label: 'Precision', desc: 'Share of phishing verdicts that were right.' },
  roc_auc: { label: 'ROC AUC', desc: 'How well scores rank phishing above legitimate URLs, across every threshold.' },
};

export function mount(panel, ctx) {
  const { results, go } = ctx;
  const m = results.metrics;
  const lookup = {};
  for (const r of m.robustness) (lookup[r.scenario] ??= {})[r.model] = r;
  const get = (scenario, modelKey, metric) => lookup[scenario][MODELS[modelKey].key][metric];
  const { n_test: nTest, n_phishing: nPhish, n_urls: nUrls } = m.data;
  const testPhishing = Math.round((nTest * nPhish) / nUrls);

  let metric = 'recall';
  const isAuc = () => metric === 'roc_auc';
  const valueFmt = (v) => (isAuc() ? fmt.dec(v, 3) : fmt.pct(v));
  const desc = h('p', { class: 'caption' }, METRICS[metric].desc);

  const chartEl = h('div');
  const metricControl = segmented({
    label: 'Metric', value: metric,
    options: Object.entries(METRICS).map(([value, x]) => ({ value, label: x.label })),
    onChange: (v) => {
      metric = v;
      desc.textContent = METRICS[v].desc;
      chart.update({});
    },
  });
  const viewControl = segmented({
    label: 'View', value: 'chart', size: 'sm',
    options: [{ value: 'chart', label: 'Chart' }, { value: 'table', label: 'Table' }],
    onChange: (v) => chart.setView(v),
  });

  const chart = barChart(chartEl, {
    categories: Object.entries(SCENARIOS).map(([key, x]) => ({ key, label: x.label, short: x.short })),
    series: ['rf', 'lrf', 'ar_lrf'].map((k) => ({ key: k, label: `${MODELS[k].label} (${MODELS[k].role.toLowerCase()})`, cls: MODELS[k].cls })),
    value: (scenario, k) => get(scenario, k, metric),
    max: 1,
    ticks: [0, 0.25, 0.5, 0.75, 1],
    format: valueFmt,
    tickFormat: (t) => (isAuc() ? String(t) : `${t * 100}%`),
    labelFormat: (v) => (isAuc() ? fmt.dec(v, 2) : `${Math.round(v * 100)}%`),
    // label every bar of a scenario where any model drops, so recoveries are labelled too
    labelWhen: (v, scenario) => ['rf', 'lrf', 'ar_lrf'].some((k) => get(scenario, k, metric) < 0.9),
    orientation: 'auto',
    breakpoint: 680,
    height: 340,
    categoryHeader: 'Scenario',
    ariaLabel: 'Grouped bar chart of each model’s score on clean and attacked test data',
  });

  const pctPts = (a, b) => `${Math.abs((a - b) * 100).toFixed(1)} points`;
  const rfClean = get('clean', 'rf', 'recall');
  const quiet = Object.keys(ATTACKS).filter((a) => Math.abs(get(a, 'rf', 'recall') - rfClean) < 0.005);
  const deep = m.mimicry_deep_dive;

  const findings = h('div', { class: 'findings' },
    h('div', {},
      h('h3', {}, 'Most attacks barely register'),
      h('p', {}, `${quiet.length} of 8 attacks move the baseline’s recall by less than half a point. `
        + 'They change digits, encoding or padding, and the forest gives those features little weight.')),
    h('div', {},
      h('h3', {}, 'Mimicry is the one that works'),
      h('p', {}, `Forcing https:// and www. drops recall from ${fmt.pct(rfClean)} to ${fmt.pct(get('benign_mimicry', 'rf', 'recall'))}. `
        + 'Every legitimate URL in PhiUSIIL has exactly that shape, so the forest learned the shape rather than the substance.')),
    h('div', {},
      h('h3', {}, 'Hardening helps, within limits'),
      h('p', {}, `AR-LRF catches ${fmt.pct(get('combined', 'ar_lrf', 'recall'))} under the combined attack, `
        + `${pctPts(get('combined', 'ar_lrf', 'recall'), get('combined', 'rf', 'recall'))} above the baseline. `
        + `On pure mimicry it reaches only ${fmt.pct(get('benign_mimicry', 'ar_lrf', 'recall'))}: `
        + `${fmt.pct(deep.share_bare_domain_after_mimicry, 0)} of mimicked URLs become a bare https://www.<domain>, with nothing lexical left to tell them apart.`)));

  // leave-one-attack-out
  const loao = m.leave_one_attack_out;
  const loaoTable = h('div', { class: 'table-wrap' }, h('table', { class: 'data-table' },
    h('thead', {}, h('tr', {},
      h('th', { scope: 'col' }, 'Attack'),
      h('th', { scope: 'col', class: 'num' }, 'Baseline RF'),
      h('th', { scope: 'col', class: 'num' }, 'AR-LRF, seen'),
      h('th', { scope: 'col', class: 'num' }, 'AR-LRF, held out'))),
    h('tbody', {}, loao.map((r) => h('tr', { class: r.attack === 'benign_mimicry' ? 'is-emphasis' : null },
      h('th', { scope: 'row' }, ATTACKS[r.attack].label),
      h('td', { class: 'num' }, fmt.pct(get(r.attack, 'rf', 'recall'))),
      h('td', { class: 'num' }, fmt.pct(get(r.attack, 'ar_lrf', 'recall'))),
      h('td', { class: 'num' }, fmt.pct(r.recall_held_out)))))));

  // mimicry deep dive
  const deepRows = [['Random Forest (baseline)', 'Baseline RF'], ['AR-LRF (hardened)', 'AR-LRF'], ['Mimicry-saturated LRF', 'Mimicry-only LRF']];
  const deepTable = h('div', { class: 'table-wrap' }, h('table', { class: 'data-table' },
    h('thead', {}, h('tr', {},
      h('th', { scope: 'col' }, 'Model'),
      h('th', { scope: 'col', class: 'num' }, 'Bare domain'),
      h('th', { scope: 'col', class: 'num' }, 'With a path'),
      h('th', { scope: 'col', class: 'num' }, 'Overall'),
      h('th', { scope: 'col', class: 'num' }, 'False positives'))),
    h('tbody', {}, deepRows.map(([key, label]) => h('tr', {},
      h('th', { scope: 'row' }, label),
      h('td', { class: 'num' }, fmt.pct(deep[key].recall_bare_domain)),
      h('td', { class: 'num' }, fmt.pct(deep[key].recall_with_path)),
      h('td', { class: 'num' }, fmt.pct(deep[key].recall_overall)),
      h('td', { class: 'num' }, fmt.pct(deep[key].false_positive_rate, 2)))))));

  panel.append(
    h('section', { class: 'sheet glass' },
      sectionHead('How each model holds up under attack',
        `Each attack is applied to the ${fmt.int(testPhishing)} phishing URLs in the test set; legitimate URLs stay as they are.`, 'h1'),
      h('div', { class: 'toolbar' }, metricControl, viewControl),
      desc,
      chartEl,
      findings),
    h('div', { class: 'split' },
      h('section', { class: 'sheet glass' },
        sectionHead('Does hardening generalise?',
          'Recall when AR-LRF is retrained without one attack and then tested on it. Held-out recall matches seen recall everywhere except mimicry, the one attack only its own training data helps with.'),
        loaoTable),
      h('section', { class: 'sheet glass' },
        sectionHead('Inside the mimicry gap',
          `Recall on mimicked phishing URLs, split by whether a path survives. Training on mimicry alone lifts bare-domain recall to ${fmt.pct(deep['Mimicry-saturated LRF'].recall_bare_domain)}, at ${fmt.pct(deep['Mimicry-saturated LRF'].false_positive_rate, 1)} false positives.`),
        deepTable)),
    nextStep({
      text: 'Why does one cosmetic change matter so much? The answer is in the data.',
      label: 'Open Features & data', onClick: () => go('features'),
    }));
}
