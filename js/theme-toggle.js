import { THEME_STORAGE_KEY, resolveTheme, nextTheme } from './lib/theme.js';

function currentTheme() {
  return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
}

function storedPreference() {
  try {
    return window.localStorage.getItem(THEME_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function initThemeToggle(button) {
  const sync = () => button.setAttribute('aria-pressed', String(currentTheme() === 'dark'));
  button.addEventListener('click', () => {
    document.documentElement.setAttribute('data-theme', nextTheme(currentTheme()));
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, currentTheme());
    } catch {
      /* storage unavailable — theme still applies for this page */
    }
    sync();
  });
  const systemDark = window.matchMedia('(prefers-color-scheme: dark)');
  systemDark.addEventListener('change', (event) => {
    const stored = storedPreference();
    if (stored !== 'light' && stored !== 'dark') {
      document.documentElement.setAttribute('data-theme', resolveTheme(null, event.matches));
      sync();
    }
  });
  sync();
}
