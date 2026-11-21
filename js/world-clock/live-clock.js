import { formatClock, formatDate } from '../lib/tz.js';
import { el } from '../dom.js';

export function createLiveClock(container, timeZone, format) {
  const timeEl = el('span', 'wc-clock-time num');
  const dateEl = el('span', 'wc-clock-date num');
  container.append(timeEl, dateEl);

  let currentFormat = format;
  let timer = 0;
  let destroyed = false;

  function render() {
    const now = Date.now();
    timeEl.textContent = formatClock(now, timeZone, currentFormat);
    dateEl.textContent = formatDate(now, timeZone);
  }

  function arm() {
    timer = setTimeout(() => {
      if (destroyed) return;
      render();
      arm();
    }, 60000 - (Date.now() % 60000) + 50);
  }

  render();
  arm();

  return {
    setFormat(f) {
      currentFormat = f;
      render();
    },
    destroy() {
      destroyed = true;
      clearTimeout(timer);
    },
  };
}