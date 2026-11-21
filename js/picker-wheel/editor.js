import { MAX_ENTRIES } from '../lib/wheel.js';
import { strings, format } from '../strings.js';
import { createIcon } from '../icons.js';
import { el } from '../dom.js';

export function createEditor(container, props, emit) {
  const card = el('div', 'pw-editor');

  const head = el('div', 'pw-editor-head');
  const headLabel = el('span');
  headLabel.textContent = strings.inputs;
  const count = el('span', 'pw-count num');
  head.append(headLabel, count);

  const inputRow = el('div', 'pw-input-row');
  const textarea = el('textarea', 'pt-field pw-textarea', {
    rows: '2',
    placeholder: strings.textareaPlaceholder,
    'aria-label': strings.textareaLabel,
  });
  const add = el('button', 'pt-btn pt-btn-primary pw-add', {
    type: 'button',
    'aria-label': strings.addEntries,
  });
  add.appendChild(createIcon('plus'));
  inputRow.append(textarea, add);

  const limit = el('p', 'pw-limit', { role: 'status' });
  const entriesList = el('ul', 'pw-entries');

  card.append(head, inputRow, limit, entriesList);
  container.appendChild(card);

  let current = props;
  let listKey = '';

  function submit() {
    const text = textarea.value;
    if (!text.trim() || current.locked || current.full) return;
    emit('add', { text });
    textarea.value = '';
    syncAdd();
  }

  function syncAdd() {
    add.disabled = !textarea.value.trim() || current.locked || current.full;
  }

  textarea.addEventListener('input', syncAdd);
  textarea.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      submit();
    }
  });
  add.addEventListener('click', submit);

  function buildList() {
    const active = document.activeElement;
    const focusId = active?.closest?.('.pw-entry')?.dataset.entryId;
    const focusControl = active?.dataset?.control;

    entriesList.textContent = '';
    for (const entry of current.entries) {
      const li = el('li', 'pw-entry', { 'data-entry-id': entry.id });

      const check = el('input', 'pw-entry-check', {
        type: 'checkbox',
        'data-control': 'check',
        'aria-label': format(strings.include, entry.name),
      });
      check.checked = entry.included;
      check.disabled = current.locked;
      check.addEventListener('change', () => emit('toggle', { id: entry.id }));

      const name = el('input', 'pw-entry-name', {
        type: 'text',
        'data-control': 'name',
        'aria-label': strings.entryName,
        maxlength: '100',
      });
      name.value = entry.name;
      name.disabled = current.locked;
      const commit = () => {
        const value = name.value.trim();
        if (!value) {
          name.value = entry.name;
          return;
        }
        if (value !== entry.name) emit('rename', { id: entry.id, name: value });
      };
      name.addEventListener('change', commit);
      name.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') name.blur();
      });

      const dup = el('button', 'pt-icon-btn', {
        type: 'button',
        'data-control': 'dup',
        'aria-label': format(strings.duplicate, entry.name),
      });
      dup.appendChild(createIcon('copy'));
      dup.disabled = current.locked || current.full;
      dup.addEventListener('click', () => emit('duplicate', { id: entry.id }));

      const del = el('button', 'pt-icon-btn', {
        type: 'button',
        'data-control': 'del',
        'aria-label': format(strings.delete, entry.name),
      });
      del.appendChild(createIcon('x'));
      del.disabled = current.locked;
      del.addEventListener('click', () => emit('delete', { id: entry.id }));

      li.append(check, name, dup, del);
      entriesList.appendChild(li);
    }

    if (focusId && focusControl) {
      const target = entriesList.querySelector(
        `[data-entry-id="${CSS.escape(focusId)}"] [data-control="${CSS.escape(focusControl)}"]`,
      );
      if (target && !target.disabled) target.focus();
    }
  }

  function update(next) {
    current = next;
    count.textContent = String(next.entries.length);
    limit.textContent = next.limitMessage;
    textarea.disabled = next.locked;
    syncAdd();
    const key = `${next.locked}|${next.full}|${next.entries.map((e) => `${e.id}:${e.name}:${e.included}`).join(',')}`;
    if (key !== listKey) {
      listKey = key;
      buildList();
    }
  }

  update(props);

  return { update };
}