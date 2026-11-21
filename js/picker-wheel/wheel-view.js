import { slicePath, polar, safeColor, textOn, DEFAULT_PALETTE } from '../lib/wheel.js';
import { strings, format } from '../strings.js';
import { el } from '../dom.js';

const NS = 'http://www.w3.org/2000/svg';
const CX = 100;
const CY = 100;
const R = 96;
const LABEL_MIN_R = 34;
const LABEL_MAX_R = 92;
const PX_TO_UNIT = 200 / 480;

function svgEl(tag, attrs = {}) {
  const node = document.createElementNS(NS, tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
  return node;
}

export function createWheelView(container, props, emit) {
  const wrap = el('div', 'pw-wheel-wrap');
  const svg = svgEl('svg', { viewBox: '0 0 200 200', role: 'img', class: 'pw-svg' });
  const rotor = svgEl('g', { class: 'pw-rotor' });
  svg.appendChild(rotor);

  const pointer = svgEl('svg', { viewBox: '0 0 20 18', class: 'pw-pointer', 'aria-hidden': 'true' });
  pointer.appendChild(svgEl('path', { d: 'M2 2 L18 2 L10 16 Z', class: 'pw-pointer-shape' }));

  const spin = el('button', 'pw-spin', { type: 'button', 'aria-label': strings.spinLabel });
  spin.textContent = strings.spin;
  spin.addEventListener('click', () => emit('spin', {}));

  wrap.append(svg, pointer, spin);
  container.appendChild(wrap);

  let current = props;
  let slicesKey = '';

  function buildSlices() {
    rotor.textContent = '';
    const { slices, textScale } = current;
    if (slices.length === 0) {
      rotor.appendChild(svgEl('circle', { cx: CX, cy: CY, r: R, class: 'pw-empty-disc' }));
      const text = svgEl('text', {
        x: CX,
        y: CY,
        'text-anchor': 'middle',
        'dominant-baseline': 'middle',
        class: 'pw-empty-text',
      });
      text.textContent = strings.emptyWheel;
      rotor.appendChild(text);
      return;
    }
    const baseSize = 18 * textScale * PX_TO_UNIT;
    const minSize = 7 * PX_TO_UNIT;
    const radialRoom = LABEL_MAX_R - LABEL_MIN_R;
    slices.forEach((slice) => {
      const color = safeColor(slice.color, DEFAULT_PALETTE[0]);
      rotor.appendChild(
        svgEl('path', { d: slicePath(CX, CY, R, slice.start, slice.end), fill: color, class: 'pw-slice' }),
      );
      const anchor = polar(CX, CY, LABEL_MAX_R, slice.mid);
      const text = svgEl('text', {
        x: anchor.x,
        y: anchor.y,
        'text-anchor': 'end',
        'font-size': baseSize,
        'font-weight': 600,
        fill: textOn(color),
        'dominant-baseline': 'middle',
        transform: `rotate(${slice.mid - 90} ${anchor.x} ${anchor.y})`,
        class: 'pw-slice-label',
      });
      text.textContent = slice.name;
      rotor.appendChild(text);
      if (typeof text.getComputedTextLength !== 'function') return;
      // Labels run inward from the rim; shrink then truncate so the text fits
      // both the radial band and the slice arc at the innermost point it reaches.
      const sweepRad = (slice.sweep * Math.PI) / 180;
      let size = baseSize;
      let name = slice.name;
      for (let pass = 0; pass < 4; pass += 1) {
        text.setAttribute('font-size', size.toFixed(2));
        text.textContent = name;
        while (name.length > 1 && text.getComputedTextLength() > radialRoom) {
          name = name.slice(0, -1);
          text.textContent = `${name}…`;
        }
        const inner = Math.max(LABEL_MIN_R, LABEL_MAX_R - text.getComputedTextLength());
        const arcRoom = 2 * inner * Math.sin(sweepRad / 2) * 0.88;
        const next = Math.max(minSize, Math.min(baseSize, arcRoom));
        if (Math.abs(next - size) < 0.05) break;
        size = next;
      }
    });
  }

  function update(next) {
    current = next;
    const key = `${next.textScale}|${next.slices.map((s) => `${s.entryId}:${s.name}:${s.color}`).join(',')}`;
    if (key !== slicesKey) {
      slicesKey = key;
      buildSlices();
    }
    svg.setAttribute('aria-label', format(strings.wheelLabel, next.slices.length));
    if (next.slices.length === 0) {
      rotor.style.transition = 'none';
      rotor.style.transform = 'rotate(0deg)';
    } else {
      rotor.style.transform = `rotate(${next.rotation}deg)`;
      rotor.style.transition = next.animMs > 0 ? `transform ${next.animMs}ms var(--ease-spin)` : 'none';
    }
    spin.disabled = next.spinning || next.slices.length === 0;
  }

  update(props);

  return { update, spinButton: spin };
}