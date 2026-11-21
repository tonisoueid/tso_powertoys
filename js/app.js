import { createWorldClock } from './world-clock/world-clock.js';
import { createPickerWheel } from './picker-wheel/picker-wheel.js';
import { createEndlessRunner } from './endless-runner/endless-runner.js';
import { initThemeToggle } from './theme-toggle.js';

initThemeToggle(document.getElementById('theme-toggle'));

const worldClock = createWorldClock(document.getElementById('world-clock'), document.getElementById('wc-live'));
const pickerWheel = createPickerWheel(document.getElementById('picker-wheel'), document.getElementById('pw-live'));
const endlessRunner = createEndlessRunner(document.getElementById('endless-runner'), document.getElementById('er-live'));

window.addEventListener(
  'pagehide',
  () => {
    worldClock.destroy();
    pickerWheel.destroy();
    endlessRunner.destroy();
  },
  { once: true },
);