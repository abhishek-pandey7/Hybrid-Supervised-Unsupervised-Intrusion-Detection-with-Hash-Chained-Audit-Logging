import { h, nextId } from '../dom.js';
import { icon } from '../icons.js';
import { SAMPLES } from '../meta.js';

export const PHISH_THRESHOLD = 0.5;

/** URL input bound to the shared scan store. */
export function addressBar({ store, onSubmit, label = 'URL to scan' }) {
  const inputId = nextId('url');
  const errId = nextId('url-err');
  const input = h('input', {
    id: inputId, class: 'addressbar__input', type: 'text', inputmode: 'url', autocomplete: 'off',
    autocapitalize: 'off', spellcheck: 'false', placeholder: 'Paste a URL, such as http://paypal.com.secure-update.info/login',
    'aria-describedby': errId,
  });
  const button = h('button', { class: 'btn btn--primary', type: 'submit' }, icon('scan'), h('span', {}, 'Scan URL'));
  const error = h('p', { id: errId, class: 'addressbar__error', role: 'alert' });
  const form = h('form', {
    class: 'addressbar', novalidate: true,
    onsubmit: (e) => {
      e.preventDefault();
      const value = input.value.trim();
      if (!value) {
        error.replaceChildren(icon('info', { size: 16 }), 'Enter a URL first, or pick one of the samples below.');
        input.focus();
        return;
      }
      onSubmit(value);
    },
  },
  h('label', { class: 'visually-hidden', for: inputId }, label),
  h('div', { class: 'addressbar__field' }, input, button),
  error);

  store.subscribe((st) => {
    if (document.activeElement !== input && st.input && input.value !== st.input) input.value = st.input;
    button.disabled = st.loading;
    form.setAttribute('aria-busy', String(st.loading));
    button.lastChild.textContent = st.loading ? 'Scanning…' : 'Scan URL';
    error.replaceChildren(...(st.error ? [icon('alert', { size: 16 }), st.error] : []));
  });
  return form;
}

export function sampleList({ onPick }) {
  return h('div', { class: 'samples' },
    h('span', { class: 'samples__label' }, 'Try a sample'),
    h('ul', { class: 'samples__list' }, SAMPLES.map((sm) => h('li', {},
      h('button', { type: 'button', class: 'chip', title: sm.note, onclick: () => onPick(sm.url) },
        sm.url.replace(/^https?:\/\//, ''))))));
}

/** Probability meter: fill = the model's identity colour, tick = decision threshold. */
export function meter(value, cls, { size = 'md', label } = {}) {
  return h('div', {
    class: `meter meter--${size}`, role: 'meter', 'aria-valuemin': 0, 'aria-valuemax': 100,
    'aria-valuenow': Math.round(value * 100), 'aria-label': label,
  },
  h('span', { class: `meter__fill fill-bg--${cls}`, style: { width: `${Math.max(0.5, value * 100)}%` } }),
  h('span', { class: 'meter__threshold', style: { left: `${PHISH_THRESHOLD * 100}%` }, 'aria-hidden': 'true' }));
}

export function verdict(p) {
  const phish = p >= PHISH_THRESHOLD;
  return h('span', { class: `verdict verdict--${phish ? 'bad' : 'good'}` },
    icon(phish ? 'alert' : 'check', { size: 16 }), phish ? 'Flags as phishing' : 'Passes as legitimate');
}

export function sectionHead(title, lede, level = 'h2') {
  return h('header', { class: 'section-head' }, h(level, {}, title), lede && h('p', { class: 'lede' }, lede));
}

export function nextStep({ text, label, onClick }) {
  return h('aside', { class: 'next-step' },
    h('p', {}, text),
    h('button', { type: 'button', class: 'btn btn--ghost', onclick: onClick }, label));
}

export function modelsMissing() {
  return h('div', { class: 'notice' }, icon('info'),
    h('div', {},
      h('strong', {}, 'Scores need the trained models.'),
      h('p', {}, 'Run ', h('code', {}, 'python src/experiment.py'),
        ' once (5 to 15 minutes; it downloads the dataset and writes models/), then scan again. Features and attack variants already work.')));
}

export function emptyState(title, body) {
  return h('div', { class: 'empty' }, h('p', { class: 'empty__title' }, title), h('p', {}, body));
}

