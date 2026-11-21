export const MAX_ENTRIES = 200;
export const MAX_NAME = 100;
export const DEFAULT_PALETTE = ['#DCEBF7', '#FDFBE6'];
export const TEXT_STEPS = [0.7, 0.85, 1, 1.2, 1.45];

export function secureRandom() {
  return crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32;
}

export function sliceAngles(weights) {
  const total = weights.reduce((s, w) => s + w, 0);
  const slices = [];
  let start = 0;
  for (const w of weights) {
    const sweep = (360 * w) / total;
    const end = start + sweep;
    slices.push({ start, end, mid: start + sweep / 2, sweep });
    start = end;
  }
  return slices;
}

export function pickIndex(weights, rand = secureRandom) {
  const total = weights.reduce((s, w) => s + w, 0);
  let r = rand() * total;
  for (let i = 0; i < weights.length; i += 1) {
    if (r < weights[i]) return i;
    r -= weights[i];
  }
  return weights.length - 1;
}

export function mod360(x) {
  return ((x % 360) + 360) % 360;
}

export function stopRotation(current, slice, turns, spread) {
  const inset = 0.1 * slice.sweep;
  const target = slice.start + inset + (slice.sweep - 2 * inset) * spread;
  const delta = mod360(-target - current);
  return current + turns * 360 + delta;
}

export function sliceAtRotation(rotation, slices) {
  const a = mod360(-rotation);
  for (let i = 0; i < slices.length; i += 1) {
    if (a >= slices[i].start && a < slices[i].end) return i;
  }
  return slices.length - 1;
}

export function polar(cx, cy, r, deg) {
  const rad = ((deg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

export function slicePath(cx, cy, r, start, end) {
  if (end - start >= 360) {
    return `M ${cx} ${cy - r} A ${r} ${r} 0 1 1 ${cx} ${cy + r} A ${r} ${r} 0 1 1 ${cx} ${cy - r} Z`;
  }
  const p1 = polar(cx, cy, r, start);
  const p2 = polar(cx, cy, r, end);
  const largeArc = end - start > 180 ? 1 : 0;
  return `M ${cx} ${cy} L ${p1.x} ${p1.y} A ${r} ${r} 0 ${largeArc} 1 ${p2.x} ${p2.y} Z`;
}

export function parseLines(text) {
  return String(text ?? '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => line.slice(0, MAX_NAME));
}

export function shuffle(list, rand = secureRandom) {
  const next = list.slice();
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [next[i], next[j]] = [next[j], next[i]];
  }
  return next;
}

function channelLuminance(v) {
  const c = v / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function luminance(hex) {
  let h = hex.slice(1);
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return 0.2126 * channelLuminance(r) + 0.7152 * channelLuminance(g) + 0.0722 * channelLuminance(b);
}

function contrast(l1, l2) {
  const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}

export function textOn(hex) {
  const bg = luminance(hex);
  const dark = luminance('#111111');
  const light = luminance('#FFFFFF');
  return contrast(bg, dark) >= contrast(bg, light) ? '#111111' : '#FFFFFF';
}

export function safeColor(c, fallback) {
  return typeof c === 'string' && /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(c) ? c : fallback;
}