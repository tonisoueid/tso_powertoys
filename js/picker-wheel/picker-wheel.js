import {
  secureRandom,
  sliceAngles,
  pickIndex,
  stopRotation,
  parseLines,
  shuffle,
  MAX_ENTRIES,
  MAX_NAME,
  DEFAULT_PALETTE,
  TEXT_STEPS,
} from '../lib/wheel.js';
import { strings, format } from '../strings.js';
import { el } from '../dom.js';
import { createWheelView } from './wheel-view.js';
import { createEditor } from './editor.js';
import { createTools } from './tools.js';

const DEFAULT_NAMES = ['Ana', 'Ben', 'Chloe', 'Dev', 'Elena'];
let dialogSeq = 0;
let entrySeq = 0;

function newEntry(name, included = true) {
  entrySeq += 1;
  return { id: `w${entrySeq}`, name, included };
}

export function createPickerWheel(root, liveRegion) {
  const state = {
    entries: DEFAULT_NAMES.map((name) => newEntry(name)),
    rotation: 0,
    animMs: 0,
    durationMs: 5000,
    textStep: 2,
    soundOn: true,
    spinning: false,
    winner: null,
    limitMessage: '',
  };
  let destroyed = false;
  let spinTimer = 0;
  let audio = null;

  const toolsSlot = el('div', 'pw-tools-slot');
  const body = el('div', 'pw-body');
  const layout = el('div', 'pw-layout');
  const wheelSlot = el('div', 'pw-wheel-slot');
  const editorSlot = el('div', 'pw-editor-slot');
  layout.append(wheelSlot, editorSlot);
  body.appendChild(layout);
  root.append(toolsSlot, body);

  const dialogId = `pw-dialog-${(dialogSeq += 1)}`;
  const dialog = el('dialog', 'pw-dialog', { 'aria-labelledby': `${dialogId}-title` });
  const dialogTitle = el('p', 'pw-winner-label', { id: `${dialogId}-title` });
  dialogTitle.textContent = strings.winnerTitle;
  const winnerName = el('p', 'pw-winner-name');
  const closeBtn = el('button', 'pt-btn pt-btn-primary pw-close', { type: 'button' });
  closeBtn.textContent = strings.close;
  dialog.append(dialogTitle, winnerName, closeBtn);
  root.appendChild(dialog);

  const tools = createTools(toolsSlot, toolsProps(), onEvent);
  const wheel = createWheelView(wheelSlot, wheelProps(), onEvent);
  const editor = createEditor(editorSlot, editorProps(), onEvent);

  closeBtn.addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close();
  });
  dialog.addEventListener('close', () => {
    state.winner = null;
    if (!destroyed) wheel.spinButton.focus();
  });

  function includedEntries() {
    return state.entries.filter((e) => e.included);
  }

  function currentSlices() {
    const included = includedEntries();
    return sliceAngles(included.map(() => 1)).map((angle, i) => ({
      entryId: included[i].id,
      name: included[i].name,
      color: DEFAULT_PALETTE[i % DEFAULT_PALETTE.length],
      ...angle,
    }));
  }

  function toolsProps() {
    return {
      soundOn: state.soundOn,
      durationMs: state.durationMs,
      locked: state.spinning,
      canShrink: state.textStep > 0,
      canGrow: state.textStep < TEXT_STEPS.length - 1,
    };
  }

  function editorProps() {
    return {
      entries: state.entries,
      locked: state.spinning,
      full: state.entries.length >= MAX_ENTRIES,
      limitMessage: state.limitMessage,
    };
  }

  function wheelProps() {
    return {
      slices: currentSlices(),
      rotation: state.rotation,
      animMs: state.animMs,
      textScale: TEXT_STEPS[state.textStep],
      spinning: state.spinning,
    };
  }

  function render() {
    if (destroyed) return;
    tools.update(toolsProps());
    editor.update(editorProps());
    wheel.update(wheelProps());
  }

  function announce(message) {
    liveRegion.textContent = '';
    requestAnimationFrame(() => {
      if (!destroyed) liveRegion.textContent = message;
    });
  }

  function ensureAudio() {
    try {
      if (!audio) {
        const Ctx = window.AudioContext ?? window.webkitAudioContext;
        if (!Ctx) return;
        audio = new Ctx();
      }
      if (audio.state === 'suspended') {
        const p = audio.resume();
        if (p && typeof p.catch === 'function') p.catch(() => {});
      }
    } catch {
      audio = null;
    }
  }

  function tone(freq, delay, dur) {
    if (!audio) return;
    try {
      const t0 = audio.currentTime + delay;
      const osc = audio.createOscillator();
      const gain = audio.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(0.12, t0 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      osc.connect(gain);
      gain.connect(audio.destination);
      osc.start(t0);
      osc.stop(t0 + dur + 0.05);
    } catch {
      /* audio must never break a spin */
    }
  }

  function onEvent(type, detail) {
    if (destroyed) return;
    if (type === 'spin') spin();
    else if (type === 'add') addFromText(detail.text);
    else if (type === 'toggle') toggle(detail.id);
    else if (type === 'rename') rename(detail.id, detail.name);
    else if (type === 'duplicate') duplicate(detail.id);
    else if (type === 'delete') remove(detail.id);
    else if (type === 'shuffle') shuffleEntries();
    else if (type === 'text-size') setTextStep(state.textStep + detail.delta);
    else if (type === 'sound-toggle') {
      state.soundOn = !state.soundOn;
      render();
    } else if (type === 'duration-change') {
      if (state.spinning) return;
      state.durationMs = detail.ms;
      render();
    }
  }

  function addFromText(text) {
    if (state.spinning) return;
    const lines = parseLines(text);
    const room = MAX_ENTRIES - state.entries.length;
    const take = lines.slice(0, Math.max(0, room));
    if (take.length === 0) {
      state.limitMessage = lines.length > 0 ? strings.limitReached : '';
      render();
      return;
    }
    state.entries = [...state.entries, ...take.map((name) => newEntry(name))];
    state.limitMessage = lines.length > take.length ? strings.limitReached : '';
    render();
  }

  function toggle(id) {
    if (state.spinning) return;
    state.entries = state.entries.map((e) => (e.id === id ? { ...e, included: !e.included } : e));
    render();
  }

  function rename(id, name) {
    if (state.spinning) return;
    const value = name.trim().slice(0, MAX_NAME);
    if (!value) return;
    state.entries = state.entries.map((e) => (e.id === id ? { ...e, name: value } : e));
    render();
  }

  function duplicate(id) {
    if (state.spinning || state.entries.length >= MAX_ENTRIES) return;
    const index = state.entries.findIndex((e) => e.id === id);
    if (index === -1) return;
    const source = state.entries[index];
    const copy = newEntry(source.name, source.included);
    state.entries = [...state.entries.slice(0, index + 1), copy, ...state.entries.slice(index + 1)];
    render();
  }

  function remove(id) {
    if (state.spinning) return;
    state.entries = state.entries.filter((e) => e.id !== id);
    if (state.entries.length < MAX_ENTRIES) state.limitMessage = '';
    render();
  }

  function shuffleEntries() {
    if (state.spinning) return;
    state.entries = shuffle(state.entries);
    render();
  }

  function setTextStep(step) {
    if (state.spinning) return;
    state.textStep = Math.min(Math.max(step, 0), TEXT_STEPS.length - 1);
    render();
  }

  function spin() {
    const included = includedEntries();
    if (state.spinning || included.length === 0) return;
    const slices = sliceAngles(included.map(() => 1));
    const i = pickIndex(included.map(() => 1));
    const winner = { name: included[i].name, index: i };
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const duration = reduced ? 800 : state.durationMs;
    const turns = duration <= 1000 ? 1 : 4 + Math.floor(secureRandom() * 3);
    state.rotation = stopRotation(state.rotation, slices[i], turns, secureRandom());
    state.animMs = duration;
    state.spinning = true;
    state.winner = winner;
    if (state.soundOn) {
      ensureAudio();
      tone(392, 0, 0.18);
    }
    announce(strings.spinning);
    render();
    spinTimer = setTimeout(() => finish(winner), duration + 80);
  }

  function finish(winner) {
    if (destroyed) return;
    state.spinning = false;
    winnerName.textContent = winner.name;
    dialog.showModal();
    announce(format(strings.winnerAnnounce, winner.name));
    if (state.soundOn) {
      tone(523, 0, 0.3);
      tone(659, 0.12, 0.3);
      tone(784, 0.24, 0.35);
    }
    root.dispatchEvent(new CustomEvent('winner-selected', { detail: winner, bubbles: true }));
    render();
  }

  render();

  return {
    destroy() {
      destroyed = true;
      clearTimeout(spinTimer);
      state.spinning = false;
      if (dialog.open) dialog.close();
      if (audio) {
        try {
          const p = audio.close();
          if (p && typeof p.catch === 'function') p.catch(() => {});
        } catch {
          /* already closed */
        }
        audio = null;
      }
      root.textContent = '';
    },
  };
}