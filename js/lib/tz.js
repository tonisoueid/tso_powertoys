const LOCALE = 'en-US';
const HOUR_MS = 3600000;
const MINUTE_MS = 60000;

const fmtCache = new Map();

function getFormatter(tz, options, locale = LOCALE) {
  const key = `${locale}|${tz}|${JSON.stringify(options)}`;
  let fmt = fmtCache.get(key);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat(locale, { ...options, timeZone: tz });
    fmtCache.set(key, fmt);
  }
  return fmt;
}

export function isValidZone(tz) {
  if (typeof tz !== 'string' || tz.length === 0) return false;
  try {
    new Intl.DateTimeFormat(LOCALE, { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export function zoneParts(ms, tz) {
  const parts = getFormatter(tz, {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    hourCycle: 'h23',
  }).formatToParts(ms);
  const out = {};
  for (const p of parts) {
    if (p.type !== 'literal') out[p.type] = Number(p.value);
  }
  return {
    year: out.year,
    month: out.month,
    day: out.day,
    hour: out.hour % 24,
    minute: out.minute,
  };
}

export function offsetMinutes(ms, tz) {
  const p = zoneParts(ms, tz);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
  return Math.round((asUtc - Math.floor(ms / MINUTE_MS) * MINUTE_MS) / MINUTE_MS);
}

export function dayStart(y, m, d, tz) {
  const guess = Date.UTC(y, m - 1, d);
  const off1 = offsetMinutes(guess, tz);
  let t = guess - off1 * MINUTE_MS;
  const off2 = offsetMinutes(t, tz);
  if (off2 !== off1) t = guess - off2 * MINUTE_MS;
  return t;
}

export function dayHours(y, m, d, tz) {
  const next = addDays({ year: y, month: m, day: d }, 1);
  const start = dayStart(y, m, d, tz);
  const end = dayStart(next.year, next.month, next.day, tz);
  return Math.ceil((end - start) / HOUR_MS);
}

export function hourBand(h) {
  if (h < 6 || h >= 22) return 'night';
  if (h >= 8 && h < 18) return 'work';
  return 'edge';
}

export function buildStrip(homeTz, rowTz, y, m, d) {
  const start = dayStart(y, m, d, homeTz);
  const hours = dayHours(y, m, d, homeTz);
  const cells = [];
  for (let i = 0; i < hours; i += 1) {
    const ms = start + i * HOUR_MS;
    const p = zoneParts(ms, rowTz);
    const newDay = p.hour === 0;
    const cell = {
      ms,
      hour: p.hour,
      minute: p.minute,
      band: hourBand(p.hour),
      newDay,
    };
    if (newDay) {
      cell.monthDay = monthDay(ms, rowTz);
      cell.weekday = weekday(ms, rowTz);
    }
    cells.push(cell);
  }
  return cells;
}

export function hourIndexAt(ms, homeTz, date) {
  const start = dayStart(date.year, date.month, date.day, homeTz);
  const hours = dayHours(date.year, date.month, date.day, homeTz);
  const i = Math.floor((ms - start) / HOUR_MS);
  return Math.min(Math.max(i, 0), hours - 1);
}

export function hoursFromHome(ms, tz, homeTz) {
  return (offsetMinutes(ms, tz) - offsetMinutes(ms, homeTz)) / 60;
}

export function formatOffset(h) {
  if (h === 0) return '0';
  const sign = h > 0 ? '+' : '-';
  const abs = Math.abs(h);
  const whole = Math.floor(abs);
  const minutes = Math.round((abs - whole) * 60);
  return minutes === 0 ? `${sign}${whole}` : `${sign}${whole}:${String(minutes).padStart(2, '0')}`;
}

export function shortLabel(ms, tz) {
  const us = getFormatter(tz, { timeZoneName: 'short' })
    .formatToParts(ms)
    .find((p) => p.type === 'timeZoneName')?.value ?? '';
  if (!us.startsWith('GMT')) return us;
  const gb = getFormatter(tz, { timeZoneName: 'short' }, 'en-GB')
    .formatToParts(ms)
    .find((p) => p.type === 'timeZoneName')?.value ?? '';
  if (!gb.startsWith('GMT')) return gb;
  return us;
}

export function meridiem(h) {
  return h < 12 ? 'am' : 'pm';
}

export function formatHourLabel(h, format) {
  if (format === '24') return String(h);
  return String(h % 12 || 12);
}

export function formatClock(ms, tz, format) {
  const p = zoneParts(ms, tz);
  const mm = String(p.minute).padStart(2, '0');
  if (format === '24') return `${String(p.hour).padStart(2, '0')}:${mm}`;
  return `${p.hour % 12 || 12}:${mm} ${meridiem(p.hour)}`;
}

export function formatDate(ms, tz) {
  return getFormatter(tz, { weekday: 'short', month: 'short', day: 'numeric' }).format(ms);
}

export function monthDay(ms, tz) {
  return getFormatter(tz, { month: 'short', day: 'numeric' }).format(ms).toUpperCase();
}

export function weekday(ms, tz) {
  return getFormatter(tz, { weekday: 'short' }).format(ms).toUpperCase();
}

export function todayIn(tz, ms = Date.now()) {
  const p = zoneParts(ms, tz);
  return { year: p.year, month: p.month, day: p.day };
}

export function addDays(date, n) {
  const t = new Date(Date.UTC(date.year, date.month - 1, date.day) + n * 24 * HOUR_MS);
  return { year: t.getUTCFullYear(), month: t.getUTCMonth() + 1, day: t.getUTCDate() };
}

export function isWeekend(date) {
  const dow = new Date(Date.UTC(date.year, date.month - 1, date.day)).getUTCDay();
  return dow === 0 || dow === 6;
}

export function sameDate(a, b) {
  return a.year === b.year && a.month === b.month && a.day === b.day;
}

export function formatCalendarDate(date, options) {
  const ms = Date.UTC(date.year, date.month - 1, date.day);
  return getFormatter('UTC', options).format(ms);
}