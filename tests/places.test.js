import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseDefaults, resolveDefaults, normalize, searchCities, toPlace, movePlace, removePlace } from '../js/lib/places.js';
import { isValidZone } from '../js/lib/tz.js';

const cities = JSON.parse(readFileSync(new URL('../data/cities.json', import.meta.url), 'utf8'));

test('T-11 cities.json validation', () => {
  assert.ok(Array.isArray(cities));
  assert.ok(cities.length >= 15);
  const ids = new Set(cities.map((c) => c.id));
  assert.equal(ids.size, cities.length);
  for (const c of cities) {
    assert.ok(Number.isInteger(c.id));
    assert.ok(typeof c.name === 'string' && c.name.length > 0 && c.name.length <= 100);
    assert.ok(typeof c.asciiName === 'string' && c.asciiName.length <= 100);
    assert.ok(typeof c.region === 'string');
    assert.ok(typeof c.country === 'string' && c.country.length > 0);
    assert.match(c.countryCode, /^[A-Z]{2}$/);
    assert.equal(typeof c.isCapital, 'boolean');
    assert.ok(Number.isInteger(c.population));
    assert.equal(isValidZone(c.timeZone), true, `${c.name}: ${c.timeZone}`);
  }
  const { places, missing } = resolveDefaults(parseDefaults('Rome|IT, New York|US, San Diego|US'), cities, isValidZone);
  assert.deepEqual(missing, []);
  assert.deepEqual(places.map((p) => p.name), ['Rome', 'New York', 'San Diego']);
});

test('T-12 parseDefaults trims, dedupes case-insensitively, parses codes', () => {
  assert.deepEqual(parseDefaults('Rome|IT, , rome, New York'), [
    { name: 'Rome', code: 'IT' },
    { name: 'New York', code: null },
  ]);
  assert.deepEqual(parseDefaults(''), []);
  assert.deepEqual(parseDefaults(null), []);
  const many = Array.from({ length: 30 }, (_, i) => `City${i}`).join(', ');
  assert.equal(parseDefaults(many).length, 20);
});

test('T-13 searchCities ranking, accents and exclusions', () => {
  const sao = searchCities('sao', cities, [], []);
  assert.ok(sao.some((c) => c.name === 'São Paulo'));
  assert.equal(sao[0].isCapital, true); // capitals outrank larger non-capitals (e.g. São Tomé vs São Paulo)
  const tok = searchCities('Tok', cities, [], []);
  assert.equal(tok[0].name, 'Tokyo');
  const excluded = searchCities('', cities, [tok[0].id], []);
  assert.ok(excluded.every((c) => c.id !== tok[0].id));
  const byName = searchCities('tok', cities, [], ['Tokyo']);
  assert.ok(byName.every((c) => c.name !== 'Tokyo'));
  assert.ok(searchCities('', cities, [], []).length <= 20);
  assert.equal(searchCities('zzzznope', cities, [], []).length, 0);
});

test('normalize strips diacritics and lowercases', () => {
  assert.equal(normalize('São Paulo'), 'sao paulo');
  assert.equal(normalize('Île-de-France'), 'ile-de-france');
});

test('resolveDefaults: capital then population tie-break, missing and dedupe', () => {
  const fake = [
    { id: 101, name: 'Springfield', region: '', country: 'United States', countryCode: 'US', timeZone: 'America/Chicago', isCapital: false, population: 100 },
    { id: 102, name: 'Springfield', region: '', country: 'United States', countryCode: 'US', timeZone: 'America/New_York', isCapital: true, population: 50 },
    { id: 103, name: 'Springfield', region: '', country: 'United States', countryCode: 'US', timeZone: 'America/Denver', isCapital: false, population: 200 },
    { id: 104, name: 'Nowhere', region: '', country: 'X', countryCode: 'XX', timeZone: '', isCapital: false, population: 1 },
    { id: 105, name: 'Badzone', region: '', country: 'X', countryCode: 'XX', timeZone: 'Mars/Base', isCapital: false, population: 1 },
  ];
  const { places, missing } = resolveDefaults(
    parseDefaults('Springfield, Nowhere, Badzone, Atlantis, Springfield'),
    fake,
    isValidZone,
  );
  assert.deepEqual(places.map((p) => p.id), [102]);
  assert.deepEqual(missing, ['Nowhere', 'Badzone', 'Atlantis']);
});

test('resolveDefaults: country code disambiguation', () => {
  const fake = [
    { id: 201, name: 'Valencia', region: '', country: 'Spain', countryCode: 'ES', timeZone: 'Europe/Madrid', isCapital: false, population: 1600000 },
    { id: 202, name: 'Valencia', region: '', country: 'Venezuela', countryCode: 'VE', timeZone: 'America/Caracas', isCapital: false, population: 1500000 },
  ];
  const { places } = resolveDefaults(parseDefaults('Valencia|VE'), fake, isValidZone);
  assert.equal(places[0].id, 202);
  const noCode = resolveDefaults(parseDefaults('Valencia'), fake, isValidZone);
  assert.equal(noCode.places[0].id, 201);
});

test('toPlace picks exactly the five Place fields', () => {
  const p = toPlace(cities[0]);
  assert.deepEqual(Object.keys(p).sort(), ['country', 'id', 'name', 'region', 'timeZone']);
  assert.equal(p.timeZone, 'Europe/Rome');
});

test('movePlace and removePlace are pure', () => {
  const list = [{ id: 1 }, { id: 2 }, { id: 3 }];
  assert.deepEqual(movePlace(list, 2, 0).map((p) => p.id), [3, 1, 2]);
  assert.deepEqual(list.map((p) => p.id), [1, 2, 3]);
  assert.deepEqual(removePlace(list, 2).map((p) => p.id), [1, 3]);
  assert.deepEqual(list.map((p) => p.id), [1, 2, 3]);
});