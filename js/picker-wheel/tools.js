import { strings, format } from '../strings.js';
import { createIcon } from '../icons.js';
import { el } from '../dom.js';

const DURATIONS = [5000, 10000, 15000];

export function createTools(container, props, emit) {
  const bar = el('div', 'pw-tools', { role: 'group', 'aria-label': strings.wheelTools });

  const shuffle = el('button', 'pt-btn pt-btn-secondary', {
    type: 'button',
    'aria-label': strings.shuffle,
  });
  shuffle.appendChild(createIcon('shuffle'));
  const shuffleText = el('span');
  shuffleText.textContent = strings.shuffleLabel;
  shuffle.appendChild(shuffleText);
  shuffle.addEventListener('click', () => emit('shuffle', {}));

  const shrink = el('button', 'pt-btn pt-btn-secondary pw-text-btn', {
    type: 'button',
    'aria-label': strings.smallerText,
  });
  shrink.textContent = 'A−';
  shrink.addEventListener('click', () => emit('text-size', { delta: -1 }));

  const grow = el('button', 'pt-btn pt-btn-secondary pw-text-btn', {
    type: 'button',
    'aria-label': strings.largerText,
  });
  grow.textContent = 'A+';
  grow.addEventListener('click', () => emit('text-size', { delta: 1 }));

  const sound = el('button', 'pt-btn pt-btn-secondary pw-sound', {
    type: 'button',
    'aria-label': strings.sound,
    'aria-pressed': 'true',
  });
  sound.appendChild(createIcon('soundOn'));
  sound.addEventListener('click', () => emit('sound-toggle', {}));

  const durationGroup = el('div', 'pt-seg', { role: 'group', 'aria-label': strings.spinDuration });
  const durationButtons = DURATIONS.map((ms) => {
    const btn = el('button', 'pt-seg-btn num', { type: 'button' });
    btn.textContent = format(strings.durationSeconds, ms / 1000);
    btn.addEventListener('click', () => emit('duration-change', { ms }));
    durationGroup.appendChild(btn);
    return btn;
  });

  bar.append(shuffle, shrink, grow, sound, durationGroup);
  container.appendChild(bar);

  function update(next) {
    shuffle.disabled = next.locked;
    shrink.disabled = next.locked || !next.canShrink;
    grow.disabled = next.locked || !next.canGrow;
    sound.setAttribute('aria-pressed', String(next.soundOn));
    sound.textContent = '';
    sound.appendChild(createIcon(next.soundOn ? 'soundOn' : 'soundOff'));
    durationButtons.forEach((btn, i) => {
      const selected = next.durationMs === DURATIONS[i];
      btn.classList.toggle('is-selected', selected);
      btn.setAttribute('aria-pressed', String(selected));
      btn.disabled = next.locked;
    });
  }

  update(props);

  return { update };
}