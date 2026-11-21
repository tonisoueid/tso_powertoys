import { hoursFromHome, formatOffset, shortLabel } from '../lib/tz.js';
import { strings, format } from '../strings.js';
import { createIcon } from '../icons.js';
import { el } from '../dom.js';
import { createLiveClock } from './live-clock.js';
import { createHourStrip } from './hour-strip.js';

export function createPlaceRow(place, props, emit) {
  const row = el('div', 'wc-row', { role: 'listitem', 'data-place-id': String(place.id) });

  const drag = el('button', 'pt-icon-btn wc-drag', {
    type: 'button',
    draggable: 'true',
    'data-control': 'drag',
    'aria-label': format(strings.reorder, place.name),
  });
  drag.appendChild(createIcon('grip'));

  const move = el('div', 'wc-move');
  const up = el('button', 'pt-icon-btn', {
    type: 'button',
    'data-control': 'up',
    'aria-label': format(strings.moveUp, place.name),
  });
  up.appendChild(createIcon('chevronUp'));
  const down = el('button', 'pt-icon-btn', {
    type: 'button',
    'data-control': 'down',
    'aria-label': format(strings.moveDown, place.name),
  });
  down.appendChild(createIcon('chevronDown'));
  move.append(up, down);

  const placeBox = el('div', 'wc-place');
  const nameLine = el('div', 'wc-name-line');
  const nameEl = el('span', 'wc-name');
  nameEl.textContent = place.name;
  const badge = el('span', 'wc-badge');
  const offset = el('span', 'wc-offset num', { role: 'img' });
  nameLine.append(nameEl, badge, offset);
  const regionEl = el('div', 'wc-region');
  regionEl.textContent = [place.country, place.region].filter(Boolean).join(', ');
  placeBox.append(nameLine, regionEl);

  const clockBox = el('div', 'wc-clock');
  const clock = createLiveClock(clockBox, place.timeZone, props.format);

  const stripBox = el('div', 'wc-strip-host');
  const strip = createHourStrip(stripBox, { ...props, timeZone: place.timeZone, placeName: place.name }, emit);

  const remove = el('button', 'pt-icon-btn wc-remove', {
    type: 'button',
    'data-control': 'remove',
    'aria-label': format(strings.remove, place.name),
  });
  remove.appendChild(createIcon('trash'));

  row.append(remove, drag, move, placeBox, clockBox, stripBox);

  remove.addEventListener('click', () => emit('row-delete', { id: place.id }));
  up.addEventListener('click', () => emit('row-move', { dir: -1, control: 'up', id: place.id }));
  down.addEventListener('click', () => emit('row-move', { dir: 1, control: 'down', id: place.id }));

  let ghost = null;

  function endDrag() {
    row.classList.remove('is-dragging');
    if (ghost) {
      ghost.remove();
      ghost = null;
    }
  }

  drag.addEventListener('dragstart', (event) => {
    event.dataTransfer.setData('text/plain', String(place.id));
    event.dataTransfer.effectAllowed = 'move';
    row.classList.add('is-dragging');
    const rect = row.getBoundingClientRect();
    ghost = row.cloneNode(true);
    ghost.classList.add('wc-row-ghost');
    ghost.classList.remove('is-dragging', 'is-drop-target');
    ghost.setAttribute('aria-hidden', 'true');
    ghost.style.width = `${Math.round(rect.width)}px`;
    document.body.appendChild(ghost);
    event.dataTransfer.setDragImage(
      ghost,
      Math.min(Math.max(event.clientX - rect.left, 0), rect.width),
      Math.min(Math.max(event.clientY - rect.top, 0), rect.height),
    );
    setTimeout(() => {
      if (ghost) {
        ghost.remove();
        ghost = null;
      }
    }, 0);
  });
  drag.addEventListener('dragend', endDrag);
  row.addEventListener('dragover', (event) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    row.classList.add('is-drop-target');
  });
  row.addEventListener('dragleave', (event) => {
    if (!row.contains(event.relatedTarget)) row.classList.remove('is-drop-target');
  });
  row.addEventListener('drop', (event) => {
    event.preventDefault();
    row.classList.remove('is-drop-target');
    const fromId = Number(event.dataTransfer.getData('text/plain'));
    if (Number.isInteger(fromId)) emit('row-drop', { fromId, toId: place.id });
  });

  let current = props;

  function update(next) {
    current = next;
    row.classList.toggle('is-top', next.isTop);
    row.classList.toggle('is-bottom', next.isBottom);
    remove.disabled = !next.canDelete;
    up.disabled = !next.canUp;
    down.disabled = !next.canDown;

    offset.textContent = '';
    if (next.isHome) {
      offset.appendChild(createIcon('home'));
      offset.setAttribute('aria-label', strings.homeIcon);
    } else {
      const text = formatOffset(hoursFromHome(next.selectedMs, place.timeZone, next.homeTz));
      offset.textContent = text;
      offset.setAttribute('aria-label', format(strings.offsetFromHome, text));
    }

    badge.textContent = shortLabel(next.selectedMs, place.timeZone);
    clock.setFormat(next.format);
    strip.update({ ...next, timeZone: place.timeZone, placeName: place.name });
  }

  update(props);

  return {
    el: row,
    update,
    focusControl(control) {
      const btn = row.querySelector(`[data-control="${control}"]`);
      if (btn && !btn.disabled) {
        btn.focus();
        return true;
      }
      return false;
    },
    destroy() {
      clock.destroy();
      endDrag();
    },
  };
}