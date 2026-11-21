import test from 'node:test';
import assert from 'node:assert/strict';
import { THEME_STORAGE_KEY, resolveTheme, nextTheme } from '../js/lib/theme.js';

test('resolveTheme honors an explicit stored preference over the system setting', () => {
  assert.equal(resolveTheme('dark', false), 'dark');
  assert.equal(resolveTheme('light', true), 'light');
});

test('resolveTheme falls back to the system preference when nothing valid is stored', () => {
  assert.equal(resolveTheme(null, true), 'dark');
  assert.equal(resolveTheme(null, false), 'light');
  assert.equal(resolveTheme('blue', true), 'dark');
  assert.equal(resolveTheme('', false), 'light');
});

test('nextTheme flips between the two themes', () => {
  assert.equal(nextTheme('light'), 'dark');
  assert.equal(nextTheme('dark'), 'light');
});

test('THEME_STORAGE_KEY is a stable non-empty string', () => {
  assert.equal(typeof THEME_STORAGE_KEY, 'string');
  assert.ok(THEME_STORAGE_KEY.length > 0);
});
