// Tiny DOM builder. Text children always go through text nodes, so URLs and
// other user input can never be interpreted as markup.
const SVG_NS = 'http://www.w3.org/2000/svg';

export function h(tag, props, ...children) {
  const isSvg = tag.startsWith('svg:');
  const el = isSvg ? document.createElementNS(SVG_NS, tag.slice(4)) : document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.setAttribute('class', v);
    else if (k === 'style' && typeof v === 'object') {
      for (const [p, val] of Object.entries(v)) {
        if (p.startsWith('--')) el.style.setProperty(p, val);
        else el.style[p] = val;
      }
    } else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, String(v));
  }
  append(el, children);
  return el;
}

export const s = (tag, props, ...children) => h('svg:' + tag, props, ...children);

export function append(el, children) {
  for (const c of [children].flat(Infinity)) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

export const fmt = {
  pct: (v, d = 1) => (v == null || Number.isNaN(v) ? '–' : `${(v * 100).toFixed(d)}%`),
  int: (v) => Math.round(v).toLocaleString('en-US'),
  dec: (v, d = 2) => Number(v).toFixed(d),
};

let uid = 0;
export const nextId = (prefix = 'id') => `${prefix}-${++uid}`;

export function segmented({ label, options, value, onChange, size }) {
  const root = h('div', { class: `segmented${size ? ' segmented--' + size : ''}`, role: 'group', 'aria-label': label });
  const buttons = options.map((o) =>
    h('button', {
      type: 'button',
      class: 'segmented__opt',
      'aria-pressed': String(o.value === value),
      onclick: () => set(o.value, true),
    }, o.label));
  root.append(...buttons);
  function set(v, notify) {
    value = v;
    buttons.forEach((b, i) => b.setAttribute('aria-pressed', String(options[i].value === v)));
    if (notify) onChange?.(v);
  }
  root.setValue = (v) => set(v, false);
  return root;
}
