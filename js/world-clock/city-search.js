import { searchCities } from '../lib/places.js';
import { strings, format } from '../strings.js';
import { el } from '../dom.js';

let listboxSeq = 0;

export function createCitySearch(container, props, emit) {
  const wrap = el('div', 'wc-search');
  const listboxId = `wc-listbox-${(listboxSeq += 1)}`;
  const input = el('input', 'pt-field wc-search-input', {
    type: 'text',
    role: 'combobox',
    'aria-expanded': 'false',
    'aria-controls': listboxId,
    'aria-autocomplete': 'list',
    'aria-label': strings.searchLabel,
    placeholder: strings.searchPlaceholder,
    autocomplete: 'off',
  });
  const listbox = el('ul', 'wc-listbox', { role: 'listbox', id: listboxId });
  listbox.hidden = true;
  wrap.append(input, listbox);
  container.appendChild(wrap);

  let current = props;
  let options = [];
  let active = -1;
  let open = false;
  let debounce = 0;

  function renderOptions() {
    options = searchCities(input.value, current.cities, current.excludeIds, current.excludeNames);
    listbox.textContent = '';
    active = options.length > 0 ? 0 : -1;
    if (options.length === 0) {
      const none = el('li', 'wc-option wc-option-none', { 'aria-disabled': 'true' });
      none.textContent = strings.noMatches;
      listbox.appendChild(none);
    }
    options.forEach((city, i) => {
      const li = el('li', 'wc-option', {
        role: 'option',
        id: `${listboxId}-opt-${city.id}`,
        'data-index': String(i),
        'aria-selected': String(i === active),
      });
      const name = el('span', 'wc-option-name');
      name.textContent = city.name;
      const country = el('span', 'wc-option-country');
      country.textContent = format(strings.optionCountry, city.country);
      li.append(name, country);
      li.addEventListener('mousedown', (event) => event.preventDefault());
      li.addEventListener('click', () => pick(i));
      listbox.appendChild(li);
    });
    syncActive();
  }

  function syncActive() {
    const items = listbox.querySelectorAll('[role="option"]');
    items.forEach((li, i) => {
      li.classList.toggle('is-active', i === active);
      li.setAttribute('aria-selected', String(i === active));
    });
    if (active >= 0 && items[active]) {
      input.setAttribute('aria-activedescendant', items[active].id);
      items[active].scrollIntoView({ block: 'nearest' });
    } else {
      input.removeAttribute('aria-activedescendant');
    }
  }

  function openList() {
    if (open) return;
    open = true;
    listbox.hidden = false;
    input.setAttribute('aria-expanded', 'true');
    renderOptions();
  }

  function closeList() {
    open = false;
    listbox.hidden = true;
    input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
    active = -1;
  }

  function pick(i) {
    const city = options[i];
    if (!city) return;
    emit('add-place', { id: city.id });
    input.value = '';
    closeList();
  }

  input.addEventListener('focus', openList);
  input.addEventListener('click', openList);
  input.addEventListener('input', () => {
    clearTimeout(debounce);
    debounce = setTimeout(() => {
      if (!open) openList();
      else renderOptions();
    }, 150);
  });
  input.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!open) {
        openList();
        return;
      }
      if (options.length === 0) return;
      const delta = event.key === 'ArrowDown' ? 1 : -1;
      active = (active + delta + options.length) % options.length;
      syncActive();
    } else if (event.key === 'Enter') {
      if (open && options.length > 0) {
        event.preventDefault();
        pick(active >= 0 ? active : 0);
      }
    } else if (event.key === 'Escape') {
      closeList();
    }
  });

  const onDocPointerDown = (event) => {
    if (open && !wrap.contains(event.target)) closeList();
  };
  document.addEventListener('pointerdown', onDocPointerDown);

  return {
    update(next) {
      current = next;
      if (open) renderOptions();
    },
    destroy() {
      clearTimeout(debounce);
      document.removeEventListener('pointerdown', onDocPointerDown);
    },
  };
}