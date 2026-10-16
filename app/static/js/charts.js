// Grouped bar chart in plain SVG. Thin bars (<= 24px), 4px rounded data end,
// 2px gaps between neighbours, hairline grid, per-group hover/focus tooltip and
// a table twin. Series colours come from CSS classes, so theme switches are free.
import { h, s } from './dom.js';
import { showTooltip, hideTooltip, tipContent } from './tooltip.js';

const GAP = 2;
const RADIUS = 4;

function columnPath(x, y, w, height) {
  if (height <= 0.5) return '';
  const r = Math.min(RADIUS, w / 2, height);
  return `M${x},${y + height}V${y + r}A${r},${r} 0 0 1 ${x + r},${y}H${x + w - r}A${r},${r} 0 0 1 ${x + w},${y + r}V${y + height}Z`;
}

function barPath(x, y, w, height) {
  if (w <= 0.5) return '';
  const r = Math.min(RADIUS, height / 2, w);
  return `M${x},${y}H${x + w - r}A${r},${r} 0 0 1 ${x + w},${y + r}V${y + height - r}A${r},${r} 0 0 1 ${x + w - r},${y + height}H${x}Z`;
}

/**
 * cfg: {
 *   categories: [{ key, label, short? }], series: [{ key, label, cls }],
 *   value(catKey, seriesKey) -> number, max, ticks: number[],
 *   format(v) (tooltip/table), tickFormat(v), labelFormat(v), labelWhen(v, catKey, seriesKey),
 *   orientation: 'v' | 'h' | 'auto', breakpoint, height, labelWidth, ariaLabel, categoryHeader
 * }
 */
export function barChart(root, cfg) {
  const hidden = new Set();
  const legend = h('div', { class: 'legend', role: 'group', 'aria-label': 'Show or hide series' });
  const plot = h('div', { class: 'chart__plot' });
  const tableWrap = h('div', { class: 'chart__table table-wrap', hidden: true });
  root.classList.add('chart');
  root.append(legend, plot, tableWrap);

  const visible = () => cfg.series.filter((se) => !hidden.has(se.key));

  function renderLegend() {
    legend.hidden = cfg.series.length < 2;
    legend.replaceChildren(...cfg.series.map((se) => h('button', {
      type: 'button', class: 'legend__item', 'aria-pressed': String(!hidden.has(se.key)),
      title: hidden.has(se.key) ? `Show ${se.label}` : `Hide ${se.label}`,
      onclick: () => {
        if (!hidden.has(se.key) && visible().length === 1) return;
        hidden.has(se.key) ? hidden.delete(se.key) : hidden.add(se.key);
        refresh();
      },
    }, h('span', { class: `swatch swatch--${se.cls}`, 'aria-hidden': 'true' }), se.label)));
  }

  function bindHover(hit, group, cat, series) {
    const content = () => tipContent(cat.label, series.map((se) => ({
      value: cfg.format(cfg.value(cat.key, se.key)), label: se.label, cls: se.cls,
    })));
    const on = (e) => {
      plot.classList.add('has-hot');
      group.classList.add('is-hot');
      showTooltip(content(), e && e.clientX != null ? { x: e.clientX, y: e.clientY } : { anchor: hit });
    };
    const off = () => {
      plot.classList.remove('has-hot');
      group.classList.remove('is-hot');
      hideTooltip();
    };
    hit.addEventListener('pointermove', on);
    hit.addEventListener('pointerdown', on);
    hit.addEventListener('pointerleave', off);
    hit.addEventListener('focus', () => on());
    hit.addEventListener('blur', off);
  }

  const summary = (cat, series) =>
    `${cat.label}: ${series.map((se) => `${se.label} ${cfg.format(cfg.value(cat.key, se.key))}`).join(', ')}`;

  function vertical(W, series) {
    const m = { top: 22, right: 4, bottom: 46, left: 44 };
    const H = cfg.height || 320;
    const iw = W - m.left - m.right;
    const ih = H - m.top - m.bottom;
    const cats = cfg.categories;
    const band = iw / cats.length;
    const k = series.length;
    const barW = Math.max(4, Math.min(24, (band * 0.74 - (k - 1) * GAP) / k));
    const groupW = k * barW + (k - 1) * GAP;
    const y = (v) => m.top + ih * (1 - Math.min(v, cfg.max) / cfg.max);

    const svg = s('svg', { width: W, height: H, viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': cfg.ariaLabel });
    for (const t of cfg.ticks) {
      const yy = Math.round(y(t)) + 0.5;
      svg.append(
        s('line', { class: t === 0 ? 'axis' : 'grid', x1: m.left, x2: W - m.right, y1: yy, y2: yy }),
        s('text', { class: 'tick', x: m.left - 8, y: yy, 'text-anchor': 'end', 'dominant-baseline': 'middle' }, cfg.tickFormat(t)));
    }
    cats.forEach((cat, i) => {
      const group = s('g', { class: 'bar-group' });
      const x0 = m.left + band * i + (band - groupW) / 2;
      series.forEach((se, j) => {
        const v = cfg.value(cat.key, se.key);
        const x = x0 + j * (barW + GAP);
        group.append(s('path', { class: `bar fill--${se.cls}`, d: columnPath(x, y(v), barW, y(0) - y(v)) }));
        if (barW >= 18 && cfg.labelWhen?.(v, cat.key, se.key)) {
          group.append(s('text', { class: 'bar-label', x: x + barW / 2, y: y(v) - 6, 'text-anchor': 'middle' }, cfg.labelFormat(v)));
        }
      });
      const cx = m.left + band * i + band / 2;
      const lines = (cat.short || cat.label).split('\n');
      const label = s('text', { class: 'cat', x: cx, y: H - m.bottom + 18, 'text-anchor': 'middle' },
        lines.map((ln, li) => s('tspan', { x: cx, dy: li ? '1.25em' : 0 }, ln)));
      const hit = s('rect', {
        class: 'hit', x: m.left + band * i, y: m.top - 12, width: band, height: ih + 12,
        tabindex: 0, 'aria-label': summary(cat, series),
      });
      bindHover(hit, group, cat, series);
      svg.append(group, label, hit);
    });
    return svg;
  }

  function horizontal(W, series) {
    // on narrow screens each category label sits above its bars instead of in a cramped column
    const stacked = W < 520;
    const labelW = stacked ? 0 : (cfg.labelWidth ?? Math.min(180, Math.round(W * 0.36)));
    const labelH = stacked ? 20 : 0;
    const m = { top: 26, right: 44, bottom: 6, left: stacked ? 1 : labelW };
    const k = series.length;
    const barH = k > 2 ? 7 : 9;
    const pad = stacked ? 10 : 14;
    const band = labelH + k * barH + (k - 1) * GAP + pad;
    const cats = cfg.categories;
    const H = m.top + band * cats.length + m.bottom;
    const iw = W - m.left - m.right;
    const x = (v) => m.left + (iw * Math.min(v, cfg.max)) / cfg.max;
    const maxChars = Math.floor(((stacked ? W : labelW) - 14) / 6.7);

    const svg = s('svg', { width: W, height: H, viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': cfg.ariaLabel });
    for (const t of cfg.ticks) {
      const xx = Math.round(x(t)) + 0.5;
      svg.append(
        s('line', { class: t === 0 ? 'axis' : 'grid', x1: xx, x2: xx, y1: m.top - 4, y2: H - m.bottom }),
        s('text', { class: 'tick', x: xx, y: m.top - 12, 'text-anchor': 'middle' }, cfg.tickFormat(t)));
    }
    cats.forEach((cat, i) => {
      const group = s('g', { class: 'bar-group' });
      const top = m.top + band * i + labelH + pad / 2;
      series.forEach((se, j) => {
        const v = cfg.value(cat.key, se.key);
        const yy = top + j * (barH + GAP);
        group.append(s('path', { class: `bar fill--${se.cls}`, d: barPath(m.left, yy, x(v) - m.left, barH) }));
        if (cfg.labelWhen?.(v, cat.key, se.key)) {
          group.append(s('text', { class: 'bar-label', x: x(v) + 6, y: yy + barH / 2, 'dominant-baseline': 'middle' }, cfg.labelFormat(v)));
        }
      });
      const text = cat.label.replace(/\n/g, ' ');
      const shown = text.length > maxChars ? text.slice(0, maxChars - 1) + '…' : text;
      const label = stacked
        ? s('text', { class: 'cat', x: m.left, y: m.top + band * i + pad / 2 + 12 }, shown)
        : s('text', { class: 'cat', x: m.left - 12, y: m.top + band * i + band / 2, 'text-anchor': 'end', 'dominant-baseline': 'middle' }, shown);
      const hit = s('rect', {
        class: 'hit', x: 0, y: m.top + band * i, width: W, height: band,
        tabindex: 0, 'aria-label': summary(cat, series),
      });
      bindHover(hit, group, cat, series);
      svg.append(group, label, hit);
    });
    return svg;
  }

  let lastWidth = 0;
  function draw() {
    const W = Math.floor(plot.clientWidth);
    if (!W) return;
    lastWidth = W;
    const series = visible();
    const orient = cfg.orientation === 'auto' ? (W < (cfg.breakpoint || 640) ? 'h' : 'v') : (cfg.orientation || 'v');
    plot.dataset.orientation = orient;
    plot.replaceChildren(orient === 'v' ? vertical(W, series) : horizontal(W, series));
  }

  function renderTable() {
    const series = visible();
    tableWrap.replaceChildren(h('table', { class: 'data-table' },
      h('thead', {}, h('tr', {},
        h('th', { scope: 'col' }, cfg.categoryHeader || ''),
        series.map((se) => h('th', { scope: 'col', class: 'num' }, se.label)))),
      h('tbody', {}, cfg.categories.map((cat) => h('tr', {},
        h('th', { scope: 'row' }, cat.label.replace(/\n/g, ' ')),
        series.map((se) => h('td', { class: 'num' }, cfg.format(cfg.value(cat.key, se.key)))))))));
  }

  function refresh() {
    renderLegend();
    draw();
    renderTable();
  }

  new ResizeObserver(() => {
    if (Math.floor(plot.clientWidth) !== lastWidth) draw();
  }).observe(plot);
  refresh();

  return {
    update(next) {
      Object.assign(cfg, next);
      refresh();
    },
    setView(view) {
      plot.hidden = view === 'table';
      tableWrap.hidden = view !== 'table';
      if (view !== 'table') draw();
    },
  };
}
