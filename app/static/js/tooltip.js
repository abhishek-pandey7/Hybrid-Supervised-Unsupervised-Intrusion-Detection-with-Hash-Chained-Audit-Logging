import { h } from './dom.js';

let tip;

function el() {
  tip ??= document.querySelector('.tooltip');
  return tip;
}

// rows: [{ value, label, cls }] – value leads, the series name follows with a line key.
export function tipContent(title, rows) {
  return h('div', {},
    title && h('div', { class: 'tooltip__title' }, title),
    rows.map((r) => h('div', { class: 'tooltip__row' },
      r.cls && h('span', { class: `linekey linekey--${r.cls}`, 'aria-hidden': 'true' }),
      h('strong', { class: 'tooltip__value' }, r.value),
      h('span', { class: 'tooltip__label' }, r.label))));
}

export function showTooltip(content, { x, y, anchor } = {}) {
  const t = el();
  t.replaceChildren(content);
  t.hidden = false;
  const r = t.getBoundingClientRect();
  let left;
  let top;
  if (anchor) {
    const a = anchor.getBoundingClientRect();
    left = a.left + a.width / 2 - r.width / 2;
    top = a.top - r.height - 10;
    if (top < 8) top = a.bottom + 10;
  } else {
    left = x + 14;
    top = y - r.height - 14;
    if (top < 8) top = y + 20;
  }
  left = Math.max(8, Math.min(left, window.innerWidth - r.width - 8));
  t.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`;
}

export function hideTooltip() {
  el().hidden = true;
}
