import { h } from './dom.js';
import { icon } from './icons.js';
import { api, createScanStore } from './store.js';
import * as overview from './views/overview.js';
import * as scan from './views/scan.js';
import * as attacks from './views/attacks.js';
import * as robustness from './views/robustness.js';
import * as features from './views/features.js';
import * as method from './views/method.js';

const TABS = [
  { id: 'overview', label: 'Overview', view: overview },
  { id: 'scan', label: 'Scan a URL', view: scan },
  { id: 'attacks', label: 'Attack lab', view: attacks },
  { id: 'robustness', label: 'Robustness', view: robustness },
  { id: 'features', label: 'Features & data', view: features },
  { id: 'method', label: 'Method', view: method },
];

// ------------------------------------------------------------------ theme
const root = document.documentElement;
const systemDark = window.matchMedia('(prefers-color-scheme: dark)');
const themeListeners = new Set();
const theme = () => root.dataset.theme || (systemDark.matches ? 'dark' : 'light');

function applyTheme(next, persist) {
  root.dataset.theme = next;
  if (persist) {
    try { localStorage.setItem('theme', next); } catch { /* storage unavailable: theme still applies */ }
  }
  renderThemeButton();
  themeListeners.forEach((fn) => fn(next));
}
systemDark.addEventListener('change', () => {
  if (!root.dataset.theme) themeListeners.forEach((fn) => fn(theme()));
  renderThemeButton();
});

const themeButton = document.querySelector('.theme-toggle');
function renderThemeButton() {
  const dark = theme() === 'dark';
  themeButton.replaceChildren(icon(dark ? 'sun' : 'moon'));
  themeButton.setAttribute('aria-label', dark ? 'Switch to light mode' : 'Switch to dark mode');
  themeButton.title = dark ? 'Light mode' : 'Dark mode';
}
themeButton.addEventListener('click', () => applyTheme(theme() === 'dark' ? 'light' : 'dark', true));
renderThemeButton();

// ------------------------------------------------------------------ tabs
const tablist = document.querySelector('.tabs');
const indicator = h('span', { class: 'tabs__indicator', 'aria-hidden': 'true' });
const main = document.querySelector('main');
const tabButtons = new Map();
const panels = new Map();
const mounted = new Map();
let current = null;

tablist.append(indicator);
for (const t of TABS) {
  const btn = h('button', {
    type: 'button', role: 'tab', id: `tab-${t.id}`, class: 'tabs__tab',
    'aria-controls': `panel-${t.id}`, 'aria-selected': 'false', tabindex: '-1',
    onclick: () => go(t.id),
  }, t.label);
  const panel = h('section', {
    role: 'tabpanel', id: `panel-${t.id}`, class: 'panel', 'aria-labelledby': `tab-${t.id}`, hidden: true, tabindex: '-1',
  });
  tabButtons.set(t.id, btn);
  panels.set(t.id, panel);
  tablist.append(btn);
  main.append(panel);
}

tablist.addEventListener('keydown', (e) => {
  const ids = TABS.map((t) => t.id);
  const i = ids.indexOf(current);
  const next = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: ids.length - 1 }[e.key];
  if (next === undefined) return;
  e.preventDefault();
  const id = ids[(next + ids.length) % ids.length];
  go(id);
  tabButtons.get(id).focus();
});

function moveIndicator() {
  const btn = tabButtons.get(current);
  if (!btn) return;
  indicator.style.width = `${btn.offsetWidth}px`;
  indicator.style.transform = `translateX(${btn.offsetLeft}px)`;
}
new ResizeObserver(moveIndicator).observe(tablist);
document.fonts?.ready.then(moveIndicator);

function go(id) {
  if (!panels.has(id)) id = 'overview';
  if (location.hash.slice(1) !== id) history.pushState(null, '', `#${id}`);
  activate(id);
}

let ctx = null;
function activate(id) {
  if (id === current) return;
  const prev = current;
  current = id;
  for (const [tid, btn] of tabButtons) {
    const on = tid === id;
    btn.setAttribute('aria-selected', String(on));
    btn.tabIndex = on ? 0 : -1;
    panels.get(tid).hidden = !on;
  }
  moveIndicator();
  tabButtons.get(id).scrollIntoView({ block: 'nearest', inline: 'nearest' });

  if (prev) mounted.get(prev)?.hide?.();
  const panel = panels.get(id);
  if (ctx && !mounted.has(id)) mounted.set(id, TABS.find((t) => t.id === id).view.mount(panel, ctx) || {});
  mounted.get(id)?.show?.();

  if (prev) {
    panel.classList.remove('is-entering');
    void panel.offsetWidth;
    panel.classList.add('is-entering');
    window.scrollTo({ top: 0 });
  }
  document.title = id === 'overview' ? 'AR-LRF phishing URL lab' : `${TABS.find((t) => t.id === id).label} – AR-LRF phishing URL lab`;
}

window.addEventListener('popstate', () => activate(location.hash.slice(1) || 'overview'));

// ------------------------------------------------------------------ boot
const store = createScanStore();
const initial = location.hash.slice(1);
activate(panels.has(initial) ? initial : 'overview');

api.results()
  .then((results) => {
    ctx = {
      results, store, go, theme,
      onThemeChange: (fn) => themeListeners.add(fn),
    };
    document.body.classList.remove('is-loading');
    const id = current;
    mounted.set(id, TABS.find((t) => t.id === id).view.mount(panels.get(id), ctx) || {});
    mounted.get(id)?.show?.();
  })
  .catch((err) => {
    document.body.classList.remove('is-loading');
    panels.get(current).replaceChildren(h('section', { class: 'sheet glass' },
      h('div', { class: 'notice notice--error' }, icon('alert'),
        h('div', {}, h('strong', {}, 'The experiment results could not be loaded.'), h('p', {}, err.message)))));
  });
