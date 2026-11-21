import { addDays, isWeekend, sameDate, formatCalendarDate } from '../lib/tz.js';
import { strings } from '../strings.js';
import { el } from '../dom.js';

const FULL_DATE = { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' };
const SHORT_DATE = { month: 'short', day: 'numeric' };

function iso(date) {
  return `${date.year}-${String(date.month).padStart(2, '0')}-${String(date.day).padStart(2, '0')}`;
}

export function createToolbar(container, props, emit) {
  const bar = el('div', 'wc-toolbar');

  const searchSlot = el('div', 'wc-search-slot');

  const dateField = el('input', 'pt-field wc-date-field', {
    type: 'date',
    'aria-label': strings.pickDate,
  });
  dateField.addEventListener('change', () => {
    const [y, m, d] = dateField.value.split('-').map(Number);
    if (y && m && d) emit('date-select', { year: y, month: m, day: d });
  });

  const tabs = el('div', 'pt-seg wc-date-tabs', { role: 'group', 'aria-label': strings.daysGroup });
  const tabButtons = [];
  for (let i = 0; i < 7; i += 1) {
    const btn = el('button', 'pt-seg-btn wc-date-tab num', { type: 'button' });
    btn.addEventListener('click', () => {
      const date = addDays(current.windowStart, i);
      emit('date-select', date);
    });
    tabs.appendChild(btn);
    tabButtons.push(btn);
  }

  const formatGroup = el('div', 'pt-seg wc-format', { role: 'group', 'aria-label': strings.timeFormatGroup });
  const formatButtons = ['12', '24'].map((f) => {
    const btn = el('button', 'pt-seg-btn', { type: 'button' });
    btn.textContent = f === '12' ? strings.format12 : strings.format24;
    btn.addEventListener('click', () => emit('format-change', { format: f }));
    formatGroup.appendChild(btn);
    return btn;
  });

  bar.append(searchSlot, dateField, tabs, formatGroup);
  container.appendChild(bar);

  let current = props;

  function update(next) {
    current = next;
    dateField.value = iso(next.selectedDate);
    tabButtons.forEach((btn, i) => {
      const date = addDays(next.windowStart, i);
      const selected = sameDate(date, next.selectedDate);
      btn.textContent = selected
        ? formatCalendarDate(date, SHORT_DATE)
        : String(date.day);
      btn.classList.toggle('is-selected', selected);
      btn.classList.toggle('is-weekend', isWeekend(date));
      btn.setAttribute('aria-pressed', String(selected));
      btn.setAttribute('aria-label', formatCalendarDate(date, FULL_DATE));
    });
    formatButtons.forEach((btn, i) => {
      const f = i === 0 ? '12' : '24';
      const selected = next.format === f;
      btn.classList.toggle('is-selected', selected);
      btn.setAttribute('aria-pressed', String(selected));
    });
  }

  function setDateControlsVisible(visible) {
    dateField.hidden = !visible;
    tabs.hidden = !visible;
    formatGroup.hidden = !visible;
  }

  update(props);

  return { update, searchSlot, setDateControlsVisible };
}