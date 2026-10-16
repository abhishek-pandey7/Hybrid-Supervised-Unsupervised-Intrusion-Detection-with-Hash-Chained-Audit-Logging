import { h, fmt } from '../dom.js';
import { icon } from '../icons.js';
import { sectionHead } from './shared.js';

const STEPS = [
  ['Load and clean the data', 'Download PhiUSIIL from UCI, flip the labels so 1 means phishing, and drop duplicate URLs.', 'src/data.py'],
  ['Extract lexical features', '29 numbers per URL: lengths, character counts and ratios, entropy, host structure and trust words.', 'src/features.py'],
  ['Split', 'Stratified 80/20 train/test split with a fixed seed, so every run sees the same URLs.', 'src/experiment.py'],
  ['Train clean baselines', 'Logistic Regression, a depth-15 Decision Tree and a 100-tree Random Forest, all on clean URLs.', 'src/experiment.py'],
  ['Attack the test set', 'Apply each of the eight evasions to the phishing test URLs, re-extract features and re-score.', 'src/attacks.py'],
  ['Harden', 'Train AR-LRF, a bounded forest, on the clean data plus one attacked copy of every phishing training URL.', 'src/experiment.py'],
  ['Probe generalisation', 'Retrain AR-LRF seven times, each time leaving one attack out, and test on the attack it never saw.', 'src/experiment.py'],
];

const COMMANDS = [
  ['Install dependencies', 'pip install -r requirements.txt'],
  ['Run the experiment (5 to 15 minutes)', 'python src/experiment.py'],
  ['Build the 3D feature-space view', 'python app/build_projection.py'],
  ['Start this interface', 'python app/server.py'],
  ['Run the tests', 'python -m pytest -q tests'],
];

export function mount(panel, ctx) {
  const m = ctx.results.metrics;
  const ar = m.ar_lrf;

  const baselines = Object.entries(m.clean);
  const baselineTable = h('div', { class: 'table-wrap' }, h('table', { class: 'data-table' },
    h('thead', {}, h('tr', {},
      h('th', { scope: 'col' }, 'Model'),
      ['Accuracy', 'Precision', 'Recall', 'F1', 'ROC AUC'].map((c) => h('th', { scope: 'col', class: 'num' }, c)),
      h('th', { scope: 'col', class: 'num' }, 'Train time'),
      h('th', { scope: 'col', class: 'num' }, 'Per URL'))),
    h('tbody', {}, baselines.map(([name, r]) => h('tr', {},
      h('th', { scope: 'row' }, name),
      ['accuracy', 'precision', 'recall', 'f1'].map((k) => h('td', { class: 'num' }, fmt.pct(r[k], 2))),
      h('td', { class: 'num' }, fmt.dec(r.roc_auc, 4)),
      h('td', { class: 'num' }, `${fmt.dec(r.train_s, 1)} s`),
      h('td', { class: 'num' }, `${fmt.dec(r.us_per_url, 1)} µs`))))));

  const config = [
    ['Trees', ar.params.n_estimators],
    ['Maximum depth', ar.params.max_depth],
    ['Minimum samples per leaf', ar.params.min_samples_leaf],
    ['Adversarial training URLs', fmt.int(ar.n_adversarial_train_samples)],
    ['Attacks used for augmentation', `${ar.augmentation_attacks.length} (all but combined)`],
    ['Training time', `${fmt.dec(ar.train_s, 1)} s`],
  ];

  const command = ([label, cmd]) => {
    const btn = h('button', { type: 'button', class: 'icon-btn', 'aria-label': `Copy: ${cmd}`, title: 'Copy' }, icon('copy', { size: 16 }));
    btn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(cmd);
        btn.replaceChildren(icon('check', { size: 16 }));
        btn.title = 'Copied';
        setTimeout(() => {
          btn.replaceChildren(icon('copy', { size: 16 }));
          btn.title = 'Copy';
        }, 1600);
      } catch {
        btn.title = 'Copy failed. Select the text instead.';
      }
    });
    return h('li', {}, h('p', { class: 'small muted' }, label), h('div', { class: 'cmd' }, h('code', {}, cmd), btn));
  };

  panel.append(
    h('section', { class: 'sheet glass' },
      sectionHead('How the experiment runs', 'One script, src/experiment.py, runs every step below and writes the numbers this interface shows.', 'h1'),
      h('ol', { class: 'pipeline' }, STEPS.map(([title, body, file]) => h('li', {},
        h('h3', {}, title), h('p', {}, body), h('code', { class: 'pipeline__file' }, file))))),
    h('div', { class: 'split split--wide-left' },
      h('section', { class: 'sheet glass' },
        sectionHead('Clean baselines', 'On unmodified test URLs every model looks near-perfect. That is the trap the paper warns about.'),
        baselineTable,
        h('p', { class: 'caption' }, 'Train and per-URL times were measured on the machine that produced results/metrics.json.')),
      h('section', { class: 'sheet glass' },
        sectionHead('AR-LRF configuration'),
        h('dl', { class: 'facts' }, config.map(([k, v]) => h('div', {}, h('dt', {}, k), h('dd', {}, String(v))))))),
    h('div', { class: 'split' },
      h('section', { class: 'sheet glass' },
        sectionHead('Run it yourself'),
        h('ol', { class: 'commands' }, COMMANDS.map(command))),
      h('section', { class: 'sheet glass' },
        sectionHead('The paper'),
        h('p', { class: 'citation' },
          'Chaudhuri, A. and Mohankumar, B. ',
          h('cite', {}, 'Adversarial-resilient lightweight phishing URL detection: evaluating lexical & metadata features under evasion techniques.'),
          ' Scientific Reports 16, 26668 (2026). ',
          h('a', { href: 'https://doi.org/10.1038/s41598-026-60046-3', target: '_blank', rel: 'noopener noreferrer' }, 'doi:10.1038/s41598-026-60046-3')),
        h('h3', {}, 'How this replication differs'),
        h('ul', { class: 'bullets' },
          h('li', {}, 'Public PhiUSIIL data (235,370 URLs) instead of the paper’s private 650,000-URL set.'),
          h('li', {}, '29 lexical features only. Domain age and Alexa rank need WHOIS and ranking lookups, so they are left out.'),
          h('li', {}, '100 trees of depth 20 instead of 300 trees of depth 16.'),
          h('li', {}, 'Attack results are reported per attack, which the paper does not do.')))));
}
