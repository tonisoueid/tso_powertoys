const NS = 'http://www.w3.org/2000/svg';

const ICONS = {
  home: ['M3 11l9-8 9 8', 'M5 10v10h14V10', 'M9 20v-6h6v6'],
  grip: ['M9 6h.01', 'M15 6h.01', 'M9 12h.01', 'M15 12h.01', 'M9 18h.01', 'M15 18h.01'],
  trash: ['M4 7h16', 'M9 7V5h6v2', 'M6 7l1 13h10l1-13', 'M10 11v6', 'M14 11v6'],
  chevronUp: ['M6 14l6-6 6 6'],
  chevronDown: ['M6 10l6 6 6-6'],
  calendar: ['M4 6h16v15H4z', 'M4 10h16', 'M8 3v4', 'M16 3v4'],
  shuffle: ['M3 6h4l10 12h4', 'M3 18h4l3-3.5', 'M14 9.5L17 6h4', 'M18 3l3 3-3 3', 'M18 15l3 3-3 3'],
  soundOn: ['M4 9v6h4l5 4V5L8 9H4z', 'M16 9a4 4 0 0 1 0 6', 'M18.5 6.5a8 8 0 0 1 0 11'],
  soundOff: ['M4 9v6h4l5 4V5L8 9H4z', 'M17 9l5 6', 'M22 9l-5 6'],
  plus: ['M12 5v14', 'M5 12h14'],
  copy: ['M9 9h11v11H9z', 'M5 15H4V4h11v1'],
  x: ['M6 6l12 12', 'M18 6L6 18'],
  alert: ['M12 8v5', 'M12 16.5h.01', 'M10.3 4.2l-8 13.8a2 2 0 0 0 1.7 3h16a2 2 0 0 0 1.7-3l-8-13.8a2 2 0 0 0-3.4 0z'],
};

export function createIcon(name, size = 16) {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.75');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  for (const d of ICONS[name] ?? []) {
    const path = document.createElementNS(NS, 'path');
    path.setAttribute('d', d);
    svg.appendChild(path);
  }
  return svg;
}