import { buildStrip, formatHourLabel } from '../lib/tz.js';
import { strings, format } from '../strings.js';
import { el } from '../dom.js';

const stripCache = new Map();

function getCells(homeTz, rowTz, date) {
  const key = `${rowTz}|${homeTz}|${date.year}-${date.month}-${date.day}`;
  let cells = stripCache.get(key);
  if (!cells) {
    cells = buildStrip(homeTz, rowTz, date.year, date.month, date.day);
    stripCache.set(key, cells);
  }
  return cells;
}

function bandText(band) {
  if (band === 'night') return strings.bandNight;
  if (band === 'work') return strings.bandWork;
  return strings.bandEdge;
}

function cellLabel(cell, fmt, isNow) {
  let label;
  if (cell.newDay) {
    label = format(strings.cellNewDay, cell.weekday, cell.monthDay);
  } else {
    const time = `${formatHourLabel(cell.hour, fmt)}:${String(cell.minute).padStart(2, '0')}`;
    label = format(strings.cellName, time, bandText(cell.band));
  }
  if (isNow) label += strings.currentHourSuffix;
  return label;
}

export function createHourStrip(container, props, emit) {
  const scroll = el('div', 'wc-strip-scroll');
  const strip = el('div', 'wc-strip', { role: 'group' });
  scroll.appendChild(strip);
  container.appendChild(scroll);

  const selLine = el('div', 'wc-col-line');
  const hovLine = el('div', 'wc-col-line is-hover-line');
  const nowTint = el('div', 'wc-col-tint');

  let current = props;
  let cacheKey = '';
  let buttons = [];
  let nowTag = null;

  function positionColumn(node, index) {
    node.style.left = `${(index / buttons.length) * 100}%`;
    node.style.width = `${100 / buttons.length}%`;
  }

  function build() {
    const { homeTz, timeZone, selectedDate, placeName } = current;
    const cells = getCells(homeTz, timeZone, selectedDate);
    strip.textContent = '';
    strip.style.setProperty('--hours', String(cells.length));
    strip.setAttribute('aria-label', format(strings.hoursGroup, placeName));
    buttons = cells.map((cell, i) => {
      const btn = el('button', `wc-cell band-${cell.band}`, { type: 'button', 'data-index': String(i) });
      if (cell.newDay) {
        const wd = el('span', 'wc-cell-newday');
        wd.textContent = cell.weekday;
        const md = el('span', 'wc-cell-newday');
        md.textContent = cell.monthDay;
        btn.append(wd, md);
      } else {
        const hour = el('span', 'wc-cell-hour');
        hour.textContent = formatHourLabel(cell.hour, current.format);
        btn.appendChild(hour);
        if (current.format === '12') {
          const sub = el('span', 'wc-cell-sub');
          sub.textContent = cell.hour < 12 ? 'am' : 'pm';
          btn.appendChild(sub);
        }
        if (cell.minute !== 0) {
          const min = el('span', 'wc-cell-sub num');
          min.textContent = `:${String(cell.minute).padStart(2, '0')}`;
          btn.appendChild(min);
        }
      }
      strip.appendChild(btn);
      return btn;
    });
    strip.append(nowTint, selLine, hovLine);
    nowTag = null;
    cacheKey = `${timeZone}|${homeTz}|${selectedDate.year}-${selectedDate.month}-${selectedDate.day}|${current.format}`;
  }

  function update(next) {
    current = next;
    const key = `${next.timeZone}|${next.homeTz}|${next.selectedDate.year}-${next.selectedDate.month}-${next.selectedDate.day}|${next.format}`;
    if (key !== cacheKey) build();
    const cells = getCells(next.homeTz, next.timeZone, next.selectedDate);
    if (nowTag) {
      nowTag.remove();
      nowTag = null;
    }
    positionColumn(selLine, next.selectedIndex);
    positionColumn(hovLine, Math.max(next.hoverIndex, 0));
    positionColumn(nowTint, Math.max(next.nowIndex, 0));
    hovLine.hidden = next.hoverIndex < 0 || next.hoverIndex === next.selectedIndex;
    nowTint.hidden = next.nowIndex < 0;
    buttons.forEach((btn, i) => {
      const cell = cells[i];
      const isSelected = i === next.selectedIndex;
      const isNow = i === next.nowIndex;
      btn.classList.toggle('is-selected', isSelected);
      btn.classList.toggle('is-hover', i === next.hoverIndex && !isSelected);
      btn.classList.toggle('is-now', isNow);
      btn.setAttribute('tabindex', isSelected ? '0' : '-1');
      btn.setAttribute('aria-label', cellLabel(cell, next.format, isNow));
      if (isNow && next.isTop) {
        nowTag = el('span', 'wc-now-tag');
        nowTag.textContent = strings.nowTag;
        btn.appendChild(nowTag);
      }
    });
  }

  strip.addEventListener('click', (event) => {
    const btn = event.target.closest('.wc-cell');
    if (btn) emit('hour-select', { index: Number(btn.dataset.index) });
  });

  strip.addEventListener('mouseover', (event) => {
    const btn = event.target.closest('.wc-cell');
    if (btn) emit('hour-hover', { index: Number(btn.dataset.index) });
  });

  strip.addEventListener('mouseleave', () => emit('hour-hover', { index: -1 }));

  strip.addEventListener('keydown', (event) => {
    const btn = event.target.closest('.wc-cell');
    if (!btn) return;
    const i = Number(btn.dataset.index);
    const last = buttons.length - 1;
    let next = null;
    if (event.key === 'ArrowLeft') next = Math.max(0, i - 1);
    else if (event.key === 'ArrowRight') next = Math.min(last, i + 1);
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = last;
    if (next === null) return;
    event.preventDefault();
    emit('hour-select', { index: next });
    const target = buttons[next];
    target.focus();
    target.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  });

  update(props);

  return { update };
}