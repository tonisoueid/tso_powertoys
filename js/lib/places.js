export function parseDefaults(text) {
  const entries = [];
  const seen = new Set();
  for (const raw of String(text ?? '').split(',')) {
    const entry = raw.trim();
    if (!entry) continue;
    const pipe = entry.indexOf('|');
    const name = (pipe === -1 ? entry : entry.slice(0, pipe)).trim();
    const code = pipe === -1 ? null : entry.slice(pipe + 1).trim().toUpperCase() || null;
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    entries.push({ name, code });
    if (entries.length >= 20) break;
  }
  return entries;
}

export function resolveDefaults(entries, cities, isValidZone) {
  const places = [];
  const missing = [];
  const seenIds = new Set();
  for (const entry of entries) {
    const wanted = entry.name.toLowerCase();
    const candidates = cities.filter(
      (c) =>
        c.name.toLowerCase() === wanted &&
        (!entry.code || c.countryCode === entry.code) &&
        typeof c.timeZone === 'string' &&
        c.timeZone.length > 0,
    );
    candidates.sort((a, b) => Number(b.isCapital) - Number(a.isCapital) || b.population - a.population);
    const city = candidates[0];
    if (!city || !isValidZone(city.timeZone)) {
      missing.push(entry.name);
      continue;
    }
    if (seenIds.has(city.id)) continue;
    seenIds.add(city.id);
    places.push(toPlace(city));
  }
  return { places, missing };
}

export function normalize(s) {
  return String(s).toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');
}

export function searchCities(query, cities, excludeIds = [], excludeNames = []) {
  const ids = new Set(excludeIds);
  const names = new Set(excludeNames.map((n) => n.toLowerCase()));
  const q = normalize(query.trim());
  const ranked = [];
  for (const city of cities) {
    if (!city.timeZone) continue;
    if (ids.has(city.id)) continue;
    if (names.has(city.name.toLowerCase())) continue;
    let tier = 0;
    if (q) {
      const fields = [normalize(city.name), normalize(city.asciiName ?? ''), normalize(city.country)];
      if (fields.some((f) => f.startsWith(q))) tier = 0;
      else if (fields.some((f) => f.includes(q))) tier = 1;
      else continue;
    }
    ranked.push({ city, tier });
  }
  ranked.sort(
    (a, b) =>
      a.tier - b.tier ||
      Number(b.city.isCapital) - Number(a.city.isCapital) ||
      b.city.population - a.city.population ||
      a.city.name.localeCompare(b.city.name),
  );
  return ranked.slice(0, 20).map((r) => r.city);
}

export function toPlace(city) {
  return {
    id: city.id,
    name: city.name,
    region: city.region,
    country: city.country,
    timeZone: city.timeZone,
  };
}

export function movePlace(list, from, to) {
  const next = list.slice();
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

export function removePlace(list, id) {
  return list.filter((p) => p.id !== id);
}