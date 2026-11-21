/*
 * Endless runner widget: header readouts, control toolbar, canvas stage and
 * input plumbing. The simulation (engine.js) and drawing (render.js) are kept
 * separate from this DOM wrapper.
 *
 * Scores are ephemeral: they live only in this component's memory. Nothing is
 * written to localStorage, sessionStorage, cookies or any backend.
 */

import { RunnerEngine, formatScore } from './engine.js';
import { createRenderer } from './render.js';
import { THEME_ICON_GRIDS } from './sprites.js';
import { strings, format } from '../strings.js';
import { el } from '../dom.js';

const NS = 'http://www.w3.org/2000/svg';
const CANVAS_H = 300;
const DIFFICULTIES = ['easy', 'medium', 'hard'];
const THEMES = ['dino', 'robot', 'box'];
const RESTART_DEBOUNCE_MS = 250;

function isTypingTarget(node) {
  if (!node || node.nodeType !== 1) return false;
  const tag = node.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || node.isContentEditable;
}

function pixelIconSvg(rows, size = 22) {
  const w = Math.max(...rows.map((r) => r.length));
  const h = rows.length;
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.setAttribute('shape-rendering', 'crispEdges');
  for (let r = 0; r < h; r += 1) {
    for (let c = 0; c < rows[r].length; c += 1) {
      const ch = rows[r][c];
      if (ch === '.' || ch === 'o') continue;
      const rect = document.createElementNS(NS, 'rect');
      rect.setAttribute('x', String(c));
      rect.setAttribute('y', String(r));
      rect.setAttribute('width', '1');
      rect.setAttribute('height', '1');
      rect.setAttribute('fill', 'currentColor');
      if (ch === '+') rect.setAttribute('opacity', '0.5');
      svg.appendChild(rect);
    }
  }
  return svg;
}

function cubeIconSvg(size = 22) {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.75');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  for (const d of ['M12 3.5 20 8 12 12.5 4 8Z', 'M4 8v8l8 4.5v-9', 'M20 8v8l-8 4.5']) {
    const path = document.createElementNS(NS, 'path');
    path.setAttribute('d', d);
    svg.appendChild(path);
  }
  return svg;
}

export function createEndlessRunner(root, liveRegion) {
  const engine = new RunnerEngine('medium');
  let skin = 'dino';
  let destroyed = false;
  let raf = 0;
  let last = 0;
  let W = 0;
  let overWall = 0;
  let lastState = engine.state;
  let lastScoreShown = -1;
  let lastBestShown = -1;

  function isDark() {
    return document.documentElement.getAttribute('data-theme') === 'dark';
  }

  /* ---------- DOM ---------- */

  const head = el('header', 'er-head');
  const headLeft = el('div', 'er-head-left');
  const title = el('h2', 'er-title', { id: 'er-title' });
  title.textContent = strings.erTitle;
  const sub = el('p', 'er-sub');
  sub.textContent = strings.erSubtitle;
  headLeft.append(title, sub);
  const scores = el('div', 'er-scores');
  const scoreLine = el('span', 'er-score-line');
  scoreLine.append(document.createTextNode(strings.erCurrentScoreLabel + ' '));
  const scoreNum = el('strong', 'er-score-num num');
  scoreLine.appendChild(scoreNum);
  const bestLine = el('span', 'er-score-line');
  bestLine.append(document.createTextNode(strings.erSessionBestLabel + ' '));
  const bestNum = el('strong', 'er-score-num num');
  bestLine.appendChild(bestNum);
  scores.append(scoreLine, bestLine);
  head.append(headLeft, scores);

  const toolbar = el('div', 'er-toolbar');
  const playBtn = el('button', 'er-btn er-btn-primary', { type: 'button' });
  const resetBtn = el('button', 'er-btn er-btn-secondary', { type: 'button' });
  resetBtn.textContent = strings.erResetLabel;
  const rightGroup = el('div', 'er-toolbar-right');
  const segGroup = el('div', 'er-seg', { role: 'group', 'aria-label': strings.erDifficulty });
  const diffButtons = new Map();
  for (const name of DIFFICULTIES) {
    const btn = el('button', 'er-seg-btn', { type: 'button', 'aria-pressed': String(name === engine.difficulty) });
    btn.textContent = strings[`er${name[0].toUpperCase()}${name.slice(1)}`];
    btn.addEventListener('click', () => setDifficulty(name));
    segGroup.appendChild(btn);
    diffButtons.set(name, btn);
  }
  const themeGroup = el('div', 'er-theme-group', { role: 'group', 'aria-label': strings.erThemeGroup });
  const themeButtons = new Map();
  for (const name of THEMES) {
    const btn = el('button', 'er-theme-btn', { type: 'button', 'aria-pressed': String(name === skin) });
    btn.setAttribute('aria-label', strings[`er${name[0].toUpperCase()}${name.slice(1)}Theme`]);
    btn.appendChild(name === 'box' ? cubeIconSvg() : pixelIconSvg(THEME_ICON_GRIDS[name]));
    btn.addEventListener('click', () => setSkin(name));
    themeGroup.appendChild(btn);
    themeButtons.set(name, btn);
  }
  rightGroup.append(segGroup, themeGroup);
  toolbar.append(playBtn, resetBtn, rightGroup);

  const stage = el('div', 'er-stage');
  const canvas = el('canvas', 'er-canvas', { tabindex: '-1', role: 'img', 'aria-label': strings.erCanvasLabel });
  stage.appendChild(canvas);
  root.append(head, toolbar, stage);

  const renderer = createRenderer(canvas);
  const ctx = canvas.getContext('2d');

  /* ---------- sizing ---------- */

  function resize() {
    const cssW = stage.clientWidth || 600;
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(CANVAS_H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    W = cssW;
    engine.viewW = cssW;
  }
  const ro = new ResizeObserver(resize);
  ro.observe(stage);
  resize();

  /* ---------- actions ---------- */

  function announce(message) {
    liveRegion.textContent = '';
    requestAnimationFrame(() => {
      if (!destroyed) liveRegion.textContent = message;
    });
  }

  function setDifficulty(name) {
    if (name === engine.difficulty) return;
    engine.setDifficulty(name);
    for (const [key, btn] of diffButtons) {
      const selected = key === name;
      btn.classList.toggle('is-selected', selected);
      btn.setAttribute('aria-pressed', String(selected));
    }
    announce(format(strings.erDifficultySet, strings[`er${name[0].toUpperCase()}${name.slice(1)}`]));
  }

  function setSkin(name) {
    if (name === skin) return;
    skin = name;
    for (const [key, btn] of themeButtons) {
      const selected = key === name;
      btn.classList.toggle('is-selected', selected);
      btn.setAttribute('aria-pressed', String(selected));
    }
    announce(format(strings.erThemeSet, strings[`er${name[0].toUpperCase()}${name.slice(1)}Theme`]));
  }

  function restartReady() {
    return Date.now() - overWall >= RESTART_DEBOUNCE_MS;
  }

  /** Space / canvas tap: jump, start from idle, or restart after game over. */
  function primaryAction() {
    if (engine.state === 'over') {
      if (restartReady()) {
        engine.restart();
        announce(strings.erStarted);
      }
      return;
    }
    if (engine.jump()) announce(strings.erStarted);
  }

  function onPlayToggle() {
    if (engine.state === 'idle') {
      engine.jump();
      announce(strings.erStarted);
    } else if (engine.state === 'running') {
      engine.pause();
      announce(strings.erPausedMsg);
    } else if (engine.state === 'paused') {
      engine.resume();
      announce(strings.erResumed);
    } else {
      engine.restart();
      announce(strings.erStarted);
    }
  }

  function onReset() {
    engine.reset();
    announce(strings.erResetMsg);
  }

  playBtn.addEventListener('click', onPlayToggle);
  resetBtn.addEventListener('click', onReset);

  canvas.addEventListener('pointerdown', (event) => {
    canvas.focus();
    if (engine.state === 'over') {
      if (!restartReady()) return;
      engine.restart();
      announce(strings.erStarted);
      return;
    }
    engine.jump();
    if (engine.state === 'running' && lastState === 'idle') announce(strings.erStarted);
  });

  /* ---------- keyboard (dashboard input safety) ---------- */

  function onKeydown(event) {
    if (destroyed) return;
    const active = document.activeElement;
    if (isTypingTarget(active)) return;
    // Buttons inside the card activate natively on Space; don't double-fire.
    if (active && active.tagName === 'BUTTON' && root.contains(active)) return;
    if (event.code === 'Space') {
      if (engine.state === 'running' || root.contains(active)) event.preventDefault();
      if (!event.repeat) primaryAction();
    } else if (event.code === 'ArrowDown') {
      if (engine.state === 'running') {
        event.preventDefault();
        engine.setFastDrop(true);
      } else if (root.contains(active)) {
        event.preventDefault();
      }
    }
  }

  function onKeyup(event) {
    if (destroyed) return;
    if (event.code === 'Space') engine.releaseJump();
    else if (event.code === 'ArrowDown') engine.setFastDrop(false);
  }

  window.addEventListener('keydown', onKeydown);
  window.addEventListener('keyup', onKeyup);
  window.addEventListener('resize', resize);

  /* ---------- loop ---------- */

  function onGameOver() {
    overWall = Date.now();
    const msg = format(strings.erOverMsg, formatScore(engine.score)) +
      (engine.score >= engine.best && engine.score > 0 ? strings.erNewBest : '');
    announce(msg);
  }

  function syncControls() {
    playBtn.textContent =
      engine.state === 'running'
        ? strings.erPauseLabel
        : engine.state === 'idle'
          ? strings.erPlayPauseLabel
          : strings.erPlayLabel;
  }

  function updateScores() {
    const s = Math.floor(engine.score);
    if (s !== lastScoreShown) {
      lastScoreShown = s;
      scoreNum.textContent = formatScore(s);
    }
    if (engine.best !== lastBestShown) {
      lastBestShown = engine.best;
      bestNum.textContent = formatScore(engine.best);
    }
  }

  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    const prev = engine.state;
    engine.step(dt);
    if (prev === 'running' && engine.state === 'over') onGameOver();
    if (engine.state !== lastState) {
      lastState = engine.state;
      syncControls();
    }
    updateScores();
    renderer.draw({ engine, skin, isDark: isDark(), W, H: CANVAS_H });
  }

  for (const [key, btn] of diffButtons) btn.classList.toggle('is-selected', key === engine.difficulty);
  for (const [key, btn] of themeButtons) btn.classList.toggle('is-selected', key === skin);
  syncControls();
  updateScores();
  last = performance.now();
  raf = requestAnimationFrame(frame);

  return {
    destroy() {
      destroyed = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener('keydown', onKeydown);
      window.removeEventListener('keyup', onKeyup);
      window.removeEventListener('resize', resize);
      root.textContent = '';
    },
  };
}
