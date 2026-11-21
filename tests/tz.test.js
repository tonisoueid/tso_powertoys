import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isValidZone,
  zoneParts,
  offsetMinutes,
  dayStart,
  dayHours,
  buildStrip,
  hourIndexAt,
  hoursFromHome,
  formatOffset,
  shortLabel,
  hourBand,
  formatClock,
  formatDate,
  formatHourLabel,
  meridiem,
  monthDay,
  weekday,
  todayIn,
  addDays,
  isWeekend,
  sameDate,
  formatCalendarDate,
} from '../js/lib/tz.js';

test('T-01 dayHours across DST in America/New_York', () => {
  assert.equal(dayHours(2026, 3, 8, 'America/New_York'), 23);
  assert.equal(dayHours(2026, 11, 1, 'America/New_York'), 25);
  assert.equal(dayHours(2026, 6, 15, 'America/New_York'), 24);
});

test('T-02 dayStart on Rome DST spring-forward day', () => {
  assert.equal(dayStart(2026, 3, 29, 'Europe/Rome'), Date.parse('2026-03-28T23:00:00Z'));
});

test('T-03 hoursFromHome Kolkata vs Rome in winter', () => {
  const ms = Date.parse('2026-01-15T12:00:00Z');
  const h = hoursFromHome(ms, 'Asia/Kolkata', 'Europe/Rome');
  assert.equal(h, 4.5);
  assert.equal(formatOffset(h), '+4:30');
});

test('T-04 formatOffset', () => {
  assert.equal(formatOffset(0), '0');
  assert.equal(formatOffset(-9), '-9');
  assert.equal(formatOffset(5.75), '+5:45');
  assert.equal(formatOffset(5.5), '+5:30');
  assert.equal(formatOffset(6), '+6');
});

test('T-05 hourBand boundaries', () => {
  assert.equal(hourBand(5), 'night');
  assert.equal(hourBand(6), 'edge');
  assert.equal(hourBand(8), 'work');
  assert.equal(hourBand(17), 'work');
  assert.equal(hourBand(18), 'edge');
  assert.equal(hourBand(22), 'night');
});

test('T-06 buildStrip LA home, Rome row, 2026-06-15', () => {
  const cells = buildStrip('America/Los_Angeles', 'Europe/Rome', 2026, 6, 15);
  assert.equal(cells.length, 24);
  assert.equal(cells[0].hour, 9);
  const newDays = cells.filter((c) => c.newDay);
  assert.equal(newDays.length, 1);
  assert.equal(cells[15].newDay, true);
  assert.equal(cells[15].hour, 0);
  assert.equal(cells[15].weekday, 'TUE');
  assert.equal(cells[15].monthDay, 'JUN 16');
  assert.equal(cells[0].band, 'work');
});

test('T-07 isValidZone', () => {
  assert.equal(isValidZone('Mars/Base'), false);
  assert.equal(isValidZone('Europe/Rome'), true);
  assert.equal(isValidZone(''), false);
  assert.equal(isValidZone(null), false);
});

test('zoneParts and offsetMinutes basics', () => {
  const ms = Date.parse('2026-01-15T12:00:00Z');
  assert.deepEqual(zoneParts(ms, 'Europe/Rome'), { year: 2026, month: 1, day: 15, hour: 13, minute: 0 });
  assert.equal(offsetMinutes(ms, 'Europe/Rome'), 60);
  assert.equal(offsetMinutes(ms, 'Asia/Kathmandu'), 345);
  assert.equal(offsetMinutes(ms, 'America/New_York'), -300);
});

test('hourIndexAt clamps to the day', () => {
  const date = { year: 2026, month: 11, day: 1 };
  const tz = 'America/New_York';
  const start = dayStart(2026, 11, 1, tz);
  assert.equal(hourIndexAt(start, tz, date), 0);
  assert.equal(hourIndexAt(start + 24 * 3600000, tz, date), 24);
  assert.equal(hourIndexAt(start - 5 * 3600000, tz, date), 0);
  assert.equal(hourIndexAt(start + 40 * 3600000, tz, date), 24);
});

test('buildStrip on a 25-hour day has 25 cells', () => {
  const cells = buildStrip('America/New_York', 'America/New_York', 2026, 11, 1);
  assert.equal(cells.length, 25);
  assert.equal(cells.filter((c) => c.newDay).length, 1);
});

test('shortLabel returns named zones and GMT fallback', () => {
  const winter = Date.parse('2026-01-15T12:00:00Z');
  assert.equal(shortLabel(winter, 'Europe/Rome'), 'CET');
  assert.equal(shortLabel(winter, 'America/New_York'), 'EST');
  const kathmandu = shortLabel(winter, 'Asia/Kathmandu');
  assert.ok(kathmandu.length > 0);
});

test('clock, date and hour label formatting', () => {
  const ms = Date.parse('2026-01-15T12:00:00Z');
  assert.equal(formatClock(ms, 'Europe/Rome', '12'), '1:00 pm');
  assert.equal(formatClock(ms, 'Europe/Rome', '24'), '13:00');
  assert.equal(formatDate(ms, 'America/New_York'), 'Thu, Jan 15');
  assert.equal(formatHourLabel(0, '12'), '12');
  assert.equal(formatHourLabel(12, '12'), '12');
  assert.equal(formatHourLabel(13, '12'), '1');
  assert.equal(formatHourLabel(13, '24'), '13');
  assert.equal(meridiem(0), 'am');
  assert.equal(meridiem(12), 'pm');
  assert.equal(monthDay(ms, 'Europe/Rome'), 'JAN 15');
  assert.equal(weekday(ms, 'Europe/Rome'), 'THU');
});

test('calendar helpers', () => {
  assert.deepEqual(todayIn('Europe/Rome', Date.parse('2026-01-15T23:30:00Z')), { year: 2026, month: 1, day: 16 });
  assert.deepEqual(addDays({ year: 2026, month: 12, day: 31 }, 1), { year: 2027, month: 1, day: 1 });
  assert.deepEqual(addDays({ year: 2026, month: 3, day: 1 }, -1), { year: 2026, month: 2, day: 28 });
  assert.equal(isWeekend({ year: 2026, month: 11, day: 14 }), true);
  assert.equal(isWeekend({ year: 2026, month: 11, day: 17 }), false);
  assert.equal(sameDate({ year: 2026, month: 1, day: 1 }, { year: 2026, month: 1, day: 1 }), true);
  assert.equal(sameDate({ year: 2026, month: 1, day: 1 }, { year: 2026, month: 1, day: 2 }), false);
  assert.equal(
    formatCalendarDate({ year: 2026, month: 11, day: 17 }, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }),
    'Tuesday, November 17, 2026',
  );
  assert.equal(formatCalendarDate({ year: 2026, month: 11, day: 17 }, { month: 'short', day: 'numeric' }), 'Nov 17');
});