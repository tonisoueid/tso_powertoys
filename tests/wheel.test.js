import test from 'node:test';
import assert from 'node:assert/strict';
import {
  secureRandom,
  sliceAngles,
  pickIndex,
  mod360,
  stopRotation,
  sliceAtRotation,
  polar,
  slicePath,
  parseLines,
  shuffle,
  textOn,
  safeColor,
  MAX_ENTRIES,
  MAX_NAME,
  DEFAULT_PALETTE,
  TEXT_STEPS,
} from '../js/lib/wheel.js';

test('T-08 stopRotation lands the picked slice under the pointer (1000 random picks)', () => {
  for (let t = 0; t < 1000; t += 1) {
    const n = 1 + Math.floor(secureRandom() * 200);
    const slices = sliceAngles(Array(n).fill(1));
    const i = pickIndex(Array(n).fill(1));
    const current = secureRandom() * 360 * 20 - 3600;
    const turns = 4 + Math.floor(secureRandom() * 3);
    const next = stopRotation(current, slices[i], turns, secureRandom());
    assert.ok(next > current, 'rotation must accumulate forward');
    assert.equal(sliceAtRotation(next, slices), i, `n=${n} i=${i}`);
    const a = mod360(-next);
    const inset = 0.1 * slices[i].sweep;
    assert.ok(a >= slices[i].start + inset - 1e-9 && a <= slices[i].end - inset + 1e-9, '10% edge inset kept');
  }
});

test('T-09 pickIndex uniform over 100,000 draws', () => {
  const counts = [0, 0, 0, 0, 0];
  for (let t = 0; t < 100000; t += 1) counts[pickIndex([1, 1, 1, 1, 1])] += 1;
  for (const c of counts) {
    assert.ok(Math.abs(c / 100000 - 0.2) <= 0.01, `count ${c} outside 20% ± 1pt`);
  }
});

test('T-10 parseLines trims, skips blanks, handles CRLF, truncates to 100', () => {
  assert.deepEqual(parseLines(' a \n\n b\r\n'), ['a', 'b']);
  assert.deepEqual(parseLines(''), []);
  const long = 'x'.repeat(150);
  assert.equal(parseLines(long)[0].length, 100);
});

test('T-14 textOn contrast and safeColor validation', () => {
  assert.equal(textOn('#DCEBF7'), '#111111');
  assert.equal(textOn('#00283C'), '#FFFFFF');
  assert.equal(textOn('#FDFBE6'), '#111111');
  assert.equal(textOn('#56759F'), '#FFFFFF');
  assert.equal(safeColor('red', '#fff'), '#fff');
  assert.equal(safeColor('#abc', '#fff'), '#abc');
  assert.equal(safeColor('#A1B2C3', '#fff'), '#A1B2C3');
  assert.equal(safeColor('javascript:alert(1)', '#fff'), '#fff');
  assert.equal(safeColor(null, '#fff'), '#fff');
});

test('T-15 shuffle keeps the multiset and does not mutate the input', () => {
  const list = Array.from({ length: 10 }, (_, i) => i);
  const copy = list.slice();
  const out = shuffle(list);
  assert.deepEqual(list, copy);
  assert.deepEqual(out.slice().sort((a, b) => a - b), copy);
  assert.notEqual(out, list);
});

test('secureRandom stays in [0, 1)', () => {
  for (let t = 0; t < 1000; t += 1) {
    const r = secureRandom();
    assert.ok(r >= 0 && r < 1);
  }
});

test('sliceAngles cumulative geometry', () => {
  const slices = sliceAngles([1, 1, 1, 1]);
  assert.deepEqual(slices.map((s) => s.start), [0, 90, 180, 270]);
  assert.deepEqual(slices.map((s) => s.end), [90, 180, 270, 360]);
  assert.deepEqual(slices.map((s) => s.mid), [45, 135, 225, 315]);
  assert.ok(slices.every((s) => s.sweep === 90));
  const one = sliceAngles([1]);
  assert.equal(one[0].sweep, 360);
});

test('mod360 normalizes negatives', () => {
  assert.equal(mod360(-90), 270);
  assert.equal(mod360(450), 90);
  assert.equal(mod360(0), 0);
});

test('polar: 0 degrees is top, clockwise', () => {
  const top = polar(100, 100, 50, 0);
  assert.ok(Math.abs(top.x - 100) < 1e-9 && Math.abs(top.y - 50) < 1e-9);
  const right = polar(100, 100, 50, 90);
  assert.ok(Math.abs(right.x - 150) < 1e-9 && Math.abs(right.y - 100) < 1e-9);
});

test('slicePath: full circle for a single slice, arc otherwise', () => {
  const full = slicePath(100, 100, 90, 0, 360);
  assert.ok(full.startsWith('M'));
  assert.ok(!full.includes('L 100 100'), 'single slice must not be a degenerate wedge');
  const wedge = slicePath(100, 100, 90, 0, 90);
  assert.match(wedge, /^M 100 100 L .* A 90 90 0 0 1 .* Z$/);
  const big = slicePath(100, 100, 90, 0, 270);
  assert.match(big, /A 90 90 0 1 1/);
});

test('constants match the spec', () => {
  assert.equal(MAX_ENTRIES, 200);
  assert.equal(MAX_NAME, 100);
  assert.deepEqual(DEFAULT_PALETTE, ['#DCEBF7', '#FDFBE6']);
  assert.deepEqual(TEXT_STEPS, [0.7, 0.85, 1, 1.2, 1.45]);
});