import {
  isValidZone,
  dayStart,
  dayHours,
  hourIndexAt,
  todayIn,
  addDays,
  sameDate,
} from '../lib/tz.js';
import { parseDefaults, resolveDefaults, toPlace, movePlace, removePlace } from '../lib/places.js';
import { strings, format } from '../strings.js';
import { createIcon } from '../icons.js';
import { el } from '../dom.js';
import { createToolbar } from './toolbar.js';
import { createCitySearch } from './city-search.js';
import { createPlaceRow } from './place-row.js';

const FALLBACK_DEFAULTS = 'Rome|IT, New York|US, San Diego|US';
const HOUR_MS = 3600000;

function dateMs(date) {
  return Date.UTC(date.year, date.month - 1, date.day);
}

function inWindow(date, windowStart) {
  const t = dateMs(date);
  return t >= dateMs(windowStart) && t <= dateMs(addDays(windowStart, 6));
}

export function createWorldClock(root, liveRegion) {
  const state = {
    cities: [],
    places: [],
    missing: [],
    loading: true,
    error: '',
    today: todayIn('UTC'),
    selectedDate: todayIn('UTC'),
    windowStart: addDays(todayIn('UTC'), -1),
    selectedHourIndex: 0,
    hoverIndex: -1,
    nowMs: Date.now(),
    format: '12',
  };
  let destroyed = false;
  let timer = 0;

  const toolbar = createToolbar(root, state, (type, detail) => {
    if (type === 'date-select') selectDate(detail);
    else if (type === 'format-change') setFormat(detail.format);
  });
  const search = createCitySearch(toolbar.searchSlot, searchProps(), (type, detail) => {
    if (type === 'add-place') addPlace(detail.id);
  });

  const alertsBox = el('div', 'wc-alerts');
  const errorAlert = el('div', 'pt-alert pt-alert-error', { role: 'alert' });
  errorAlert.appendChild(createIcon('alert'));
  const errorMsg = el('span', 'pt-alert-msg');
  errorMsg.textContent = strings.loadError;
  const retry = el('button', 'pt-alert-retry', { type: 'button' });
  retry.textContent = strings.retry;
  retry.addEventListener('click', load);
  errorAlert.append(errorMsg, retry);
  const warningAlert = el('div', 'pt-alert pt-alert-warning', { role: 'alert' });
  warningAlert.appendChild(createIcon('alert'));
  const warningMsg = el('span', 'pt-alert-msg');
  warningAlert.appendChild(warningMsg);
  alertsBox.append(errorAlert, warningAlert);

  const emptyMsg = el('p', 'wc-empty');
  emptyMsg.textContent = strings.noPlaces;

  const skeleton = el('div', 'wc-skeleton', { 'aria-busy': 'true', 'aria-label': strings.loading });

  const list = el('div', 'wc-list', { role: 'list' });

  root.append(alertsBox, emptyMsg, skeleton, list);

  const rows = new Map();
  const toolbarBar = toolbar.searchSlot.parentElement;
  let noPlacesLayout = null;

  function homeTz() {
    return state.places[0]?.timeZone;
  }

  function selectedMs() {
    const d = state.selectedDate;
    return dayStart(d.year, d.month, d.day, homeTz()) + state.selectedHourIndex * HOUR_MS;
  }

  function nowIndex() {
    if (!homeTz() || !sameDate(state.selectedDate, state.today)) return -1;
    return hourIndexAt(state.nowMs, homeTz(), state.today);
  }

  function searchProps() {
    return {
      cities: state.cities,
      excludeIds: state.places.map((p) => p.id),
      excludeNames: state.places.map((p) => p.name),
    };
  }

  function rowProps(i) {
    const last = state.places.length - 1;
    return {
      isHome: i === 0,
      canDelete: state.places.length > 1,
      canUp: i > 0,
      canDown: i < last,
      homeTz: homeTz(),
      selectedDate: state.selectedDate,
      selectedMs: selectedMs(),
      format: state.format,
      selectedIndex: state.selectedHourIndex,
      isTop: i === 0,
      isBottom: i === last,
      nowIndex: nowIndex(),
      hoverIndex: state.hoverIndex,
    };
  }

  function announce(message) {
    liveRegion.textContent = '';
    requestAnimationFrame(() => {
      if (!destroyed) liveRegion.textContent = message;
    });
  }

  function render() {
    if (destroyed) return;
    const hasPlaces = state.places.length > 0;
    root.setAttribute('aria-busy', String(state.loading));
    skeleton.hidden = !state.loading;
    errorAlert.hidden = !state.error;
    warningAlert.hidden = state.loading || Boolean(state.error) || state.missing.length === 0;
    if (!warningAlert.hidden) {
      warningMsg.textContent = format(strings.missingWarning, state.missing.join(', '));
    }
    emptyMsg.hidden = state.loading || Boolean(state.error) || hasPlaces;
    const noPlaces = !state.loading && !state.error && !hasPlaces;
    if (noPlaces !== noPlacesLayout) {
      noPlacesLayout = noPlaces;
      if (noPlaces) {
        root.insertBefore(alertsBox, toolbarBar);
        root.insertBefore(emptyMsg, toolbarBar);
      } else {
        root.insertBefore(toolbarBar, alertsBox);
      }
    }
    toolbar.update(state);
    toolbar.setDateControlsVisible(!state.loading && !state.error && hasPlaces);
    search.update(searchProps());
    list.hidden = state.loading || Boolean(state.error) || !hasPlaces;

    const seen = new Set();
    state.places.forEach((place, i) => {
      seen.add(place.id);
      let row = rows.get(place.id);
      if (!row) {
        row = createPlaceRow(place, rowProps(i), onRowEvent);
        rows.set(place.id, row);
      } else {
        row.update(rowProps(i));
      }
      list.appendChild(row.el);
    });
    for (const [id, row] of rows) {
      if (!seen.has(id)) {
        row.destroy();
        row.el.remove();
        rows.delete(id);
      }
    }
  }

  function updateRows() {
    state.places.forEach((place, i) => rows.get(place.id)?.update(rowProps(i)));
  }

  function onRowEvent(type, detail) {
    if (type === 'row-delete') removePlaceById(detail.id);
    else if (type === 'row-move') {
      const from = state.places.findIndex((p) => p.id === detail.id);
      move(from, from + detail.dir, detail.control);
    } else if (type === 'row-drop') {
      const from = state.places.findIndex((p) => p.id === detail.fromId);
      const to = state.places.findIndex((p) => p.id === detail.toId);
      if (from !== -1 && to !== -1 && from !== to) move(from, to, 'drag');
    } else if (type === 'hour-select') selectHour(detail.index);
    else if (type === 'hour-hover') {
      if (state.hoverIndex === detail.index) return;
      state.hoverIndex = detail.index;
      updateRows();
    }
  }

  async function load() {
    state.loading = true;
    state.error = '';
    render();
    try {
      const [cfgRes, citiesRes] = await Promise.all([fetch('data/config.json'), fetch('data/cities.json')]);
      if (!cfgRes.ok || !citiesRes.ok) throw new Error('fetch failed');
      const [cfg, cities] = await Promise.all([cfgRes.json(), citiesRes.json()]);
      if (destroyed) return;
      if (!Array.isArray(cities)) throw new Error('invalid cities');
      const text =
        typeof cfg?.defaultPlaces === 'string' && cfg.defaultPlaces.trim() ? cfg.defaultPlaces : FALLBACK_DEFAULTS;
      const { places, missing } = resolveDefaults(parseDefaults(text), cities, isValidZone);
      state.cities = cities;
      state.places = places;
      state.missing = missing;
      state.loading = false;
      setReference();
      render();
    } catch {
      if (destroyed) return;
      state.loading = false;
      state.error = strings.loadError;
      render();
    }
  }

  function setReference() {
    if (!homeTz()) return;
    state.nowMs = Date.now();
    state.today = todayIn(homeTz(), state.nowMs);
    state.selectedDate = state.today;
    state.windowStart = addDays(state.today, -1);
    state.selectedHourIndex = hourIndexAt(state.nowMs, homeTz(), state.today);
  }

  function setPlaces(newList, message) {
    const ms = selectedMs();
    state.places = newList;
    const tz = homeTz();
    state.selectedDate = todayIn(tz, ms);
    state.selectedHourIndex = hourIndexAt(ms, tz, state.selectedDate);
    state.today = todayIn(tz);
    if (!inWindow(state.selectedDate, state.windowStart)) {
      state.windowStart = addDays(state.selectedDate, -1);
    }
    render();
    announce(message);
  }

  function addPlace(cityId) {
    const city = state.cities.find((c) => c.id === cityId);
    if (!city || !isValidZone(city.timeZone)) {
      announce(strings.cannotAdd);
      return;
    }
    const shown = state.places.some(
      (p) => p.id === city.id || p.name.toLowerCase() === city.name.toLowerCase(),
    );
    if (shown) {
      announce(format(strings.alreadyShown, city.name));
      return;
    }
    setPlaces([...state.places, toPlace(city)], format(strings.added, city.name));
  }

  function removePlaceById(id) {
    if (state.places.length <= 1) return;
    const index = state.places.findIndex((p) => p.id === id);
    if (index === -1) return;
    const name = state.places[index].name;
    const newList = removePlace(state.places, id);
    const message =
      index === 0
        ? format(strings.removedHome, name, newList[0].name)
        : format(strings.removed, name);
    setPlaces(newList, message);
    const focusIndex = Math.min(index, newList.length - 1);
    rows.get(newList[focusIndex].id)?.focusControl('remove');
  }

  function move(from, to, control) {
    if (from < 0 || to < 0 || from >= state.places.length || to >= state.places.length || from === to) return;
    const name = state.places[from].name;
    const topBefore = state.places[0].id;
    const newList = movePlace(state.places, from, to);
    let message = format(strings.moved, name, to + 1);
    if (newList[0].id !== topBefore) message += format(strings.movedHomeSuffix, newList[0].name);
    setPlaces(newList, message);
    const row = rows.get(newList[to].id);
    if (row && !row.focusControl(control)) {
      row?.focusControl(control === 'up' ? 'down' : 'up');
    }
  }

  function selectDate(date) {
    const hours = dayHours(date.year, date.month, date.day, homeTz());
    state.selectedHourIndex = Math.min(state.selectedHourIndex, hours - 1);
    state.selectedDate = date;
    if (!inWindow(date, state.windowStart)) {
      state.windowStart = addDays(date, -1);
    }
    render();
  }

  function selectHour(i) {
    const d = state.selectedDate;
    const hours = dayHours(d.year, d.month, d.day, homeTz());
    state.selectedHourIndex = Math.min(Math.max(i, 0), hours - 1);
    render();
  }

  function setFormat(f) {
    state.format = f === '24' ? '24' : '12';
    render();
  }

  function tick() {
    if (destroyed) return;
    state.nowMs = Date.now();
    if (homeTz()) {
      const t = todayIn(homeTz(), state.nowMs);
      if (!sameDate(t, state.today)) state.today = t;
      updateRows();
    }
    arm();
  }

  function arm() {
    timer = setTimeout(tick, 60000 - (Date.now() % 60000) + 50);
  }

  load();
  arm();

  return {
    destroy() {
      destroyed = true;
      clearTimeout(timer);
      search.destroy();
      for (const row of rows.values()) row.destroy();
      rows.clear();
      root.textContent = '';
    },
  };
}