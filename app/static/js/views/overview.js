import { h, fmt, segmented } from '../dom.js';
import { icon } from '../icons.js';
import { addressBar, sampleList, nextStep } from './shared.js';

export function mount(panel, ctx) {
  const { results, store, go } = ctx;
  const robust = results.metrics.robustness;
  const recall = (scenario, model) => robust.find((r) => r.scenario === scenario && r.model === model).recall;
  const rfClean = recall('clean', 'Random Forest (baseline)');
  const rfMimic = recall('benign_mimicry', 'Random Forest (baseline)');
  const rfCombined = recall('combined', 'Random Forest (baseline)');
  const arCombined = recall('combined', 'AR-LRF (hardened)');
  const arMimic = recall('benign_mimicry', 'AR-LRF (hardened)');
  const data = results.metrics.data;

  const scanAndGo = (url) => {
    store.scan(url);
    go('scan');
  };

  const copy = h('div', { class: 'sheet glass hero__copy' },
    h('h1', { class: 'display' },
      `Catches ${fmt.pct(rfClean)} of phishing URLs. Misses ${fmt.pct(1 - rfMimic, 0)} once they start with https://www.`),
    h('p', { class: 'lede' },
      `This lab rebuilds the AR-LRF study (Scientific Reports, 2026) on ${fmt.int(data.n_urls)} real URLs. `
      + 'A Random Forest reads only the text of each URL, eight evasion attacks try to fool it, '
      + 'and an adversarially trained model tries to win the ground back.'),
    addressBar({ store, onSubmit: scanAndGo }),
    sampleList({ onPick: scanAndGo }));

  const space = featureSpace(results.projection, ctx);

  const steps = [
    {
      title: 'Clean test set', value: rfClean, cls: 'rf',
      body: 'of phishing URLs caught by the baseline Random Forest.',
    },
    {
      title: 'Benign mimicry', value: rfMimic, cls: 'rf',
      body: 'caught once the same URLs are forced to https:// with a www. prefix. Nothing else changes.',
    },
    {
      title: 'Adversarial training', value: arCombined, cls: 'ar',
      body: `caught by AR-LRF under the combined attack, up from ${fmt.pct(rfCombined)}. Pure mimicry still gets through: ${fmt.pct(arMimic)}.`,
    },
  ];
  const story = h('section', { class: 'sheet glass story', 'aria-labelledby': 'story-title' },
    h('h2', { id: 'story-title' }, 'What the experiment found'),
    h('ol', { class: 'story__steps' }, steps.map((st) => h('li', { class: 'story__step' },
      h('h3', {}, st.title),
      h('p', { class: 'story__value' }, fmt.pct(st.value)),
      h('div', { class: 'story__bar', 'aria-hidden': 'true' },
        h('span', { class: `fill-bg--${st.cls}`, style: { width: `${st.value * 100}%` } })),
      h('p', { class: 'story__body' }, st.body)))));

  panel.append(
    h('section', { class: 'hero' }, copy, space.el),
    story,
    nextStep({
      text: 'Paste any URL to see where it really goes and how both models score it.',
      label: 'Scan a URL', onClick: () => go('scan'),
    }));

  return { show: () => space.setActive(true), hide: () => space.setActive(false) };
}

function featureSpace(projection, ctx) {
  const stage = h('div', { class: 'space__stage' });
  const stat = h('p', { class: 'space__stat', 'aria-live': 'polite' });
  const el = h('section', { class: 'sheet glass hero__space', 'aria-labelledby': 'space-title' });
  let view = null;
  let pendingActive = true;

  const hasDetections = !!projection?.phishing?.rf_caught;
  const missRate = (mode) => {
    const c = projection.phishing.rf_caught[mode];
    return 1 - c.reduce((a, b) => a + b, 0) / c.length;
  };
  const setStat = (mode) => {
    if (!hasDetections) return;
    stat.replaceChildren('The baseline misses ', h('strong', {}, fmt.pct(missRate(mode))), ' of these phishing URLs',
      mode === 'mimicry' ? ' once https://www. is added.' : '.');
  };

  const toggle = segmented({
    label: 'Phishing URLs shown', value: 'clean',
    options: [{ value: 'clean', label: 'Original URLs' }, { value: 'mimicry', label: 'With https://www. added' }],
    onChange: (mode) => {
      view?.setMode(mode);
      setStat(mode);
    },
  });

  const legendItem = (cls, text) => h('li', {}, h('span', { class: `dot dot--${cls}`, 'aria-hidden': 'true' }), text);

  el.append(
    h('div', { class: 'space__head' },
      h('h2', { id: 'space-title' }, 'The feature space, as the forest sees it'),
      toggle),
    stage,
    h('div', { class: 'space__foot' },
      stat,
      h('ul', { class: 'space__legend' },
        legendItem('legit', 'Legitimate'),
        legendItem('phish', 'Phishing, caught by the baseline'),
        hasDetections && legendItem('missed', 'Phishing, missed by the baseline')),
      h('p', { class: 'caption' },
        `${fmt.int((projection?.n_per_class ?? 700) * 2)} URLs from the test set. Each of the 29 features is weighted by its importance to the baseline forest, then projected onto three principal components. Drag to rotate.`)));

  if (!projection) {
    stage.append(h('div', { class: 'space__fallback' }, icon('info'),
      h('p', {}, 'Generate this view with ', h('code', {}, 'python app/build_projection.py'), ' after running the experiment.')));
    toggle.hidden = true;
    return { el, setActive() {} };
  }

  setStat('clean');
  import('../hero3d.js')
    .then(({ createFeatureSpace }) => {
      view = createFeatureSpace(stage, projection, { theme: ctx.theme() });
      view.setActive(pendingActive);
      ctx.onThemeChange((t) => view.setTheme(t));
    })
    .catch(() => {
      stage.append(h('div', { class: 'space__fallback' }, icon('info'),
        h('p', {}, 'The 3D view needs WebGL and a connection to cdn.jsdelivr.net to load three.js.')));
    });

  return {
    el,
    setActive(on) {
      pendingActive = on;
      view?.setActive(on);
    },
  };
}
