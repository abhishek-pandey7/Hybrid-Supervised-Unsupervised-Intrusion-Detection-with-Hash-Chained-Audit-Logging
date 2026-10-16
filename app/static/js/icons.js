import { s } from './dom.js';

// 24px grid, 1.75px strokes, drawn to sit on the text baseline at 16–18px.
const PATHS = {
  check: ['M5 12.5l4.2 4.2L19 7'],
  alert: ['M12 4.5L21 19.5H3z', 'M12 10v4.5', 'M12 17.2v.1'],
  sun: ['M12 7.5a4.5 4.5 0 1 0 0 9a4.5 4.5 0 1 0 0-9z',
    'M12 2.5v2', 'M12 19.5v2', 'M4.6 4.6l1.4 1.4', 'M18 18l1.4 1.4', 'M2.5 12h2', 'M19.5 12h2', 'M4.6 19.4L6 18', 'M18 6l1.4-1.4'],
  moon: ['M19.5 14.5A8 8 0 0 1 9.5 4.5a8 8 0 1 0 10 10z'],
  copy: ['M9 9h10v10H9z', 'M15 9V5H5v10h4'],
  info: ['M12 3.5a8.5 8.5 0 1 0 0 17a8.5 8.5 0 1 0 0-17z', 'M12 11v5', 'M12 7.8v.1'],
  scan: ['M4 8V5.5A1.5 1.5 0 0 1 5.5 4H8', 'M16 4h2.5A1.5 1.5 0 0 1 20 5.5V8', 'M20 16v2.5a1.5 1.5 0 0 1-1.5 1.5H16', 'M8 20H5.5A1.5 1.5 0 0 1 4 18.5V16', 'M7.5 12h9'],
  rotate: ['M4.5 12a7.5 7.5 0 0 1 13-5.1', 'M18 3.5v3.8h-3.8', 'M19.5 12a7.5 7.5 0 0 1-13 5.1', 'M6 20.5v-3.8h3.8'],
};

export function icon(name, { size = 18, label } = {}) {
  return s('svg', {
    class: `icon icon--${name}`, width: size, height: size, viewBox: '0 0 24 24', fill: 'none',
    stroke: 'currentColor', 'stroke-width': 1.75, 'stroke-linecap': 'round', 'stroke-linejoin': 'round',
    'aria-hidden': label ? null : 'true', role: label ? 'img' : null, 'aria-label': label,
  }, PATHS[name].map((d) => s('path', { d })));
}
