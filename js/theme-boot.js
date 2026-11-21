(function () {
  var stored = null;
  try {
    stored = window.localStorage.getItem('powertoys-theme');
  } catch (err) {
    /* storage unavailable (private mode, etc.) — fall back to system */
  }
  var theme =
    stored === 'light' || stored === 'dark'
      ? stored
      : window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light';
  document.documentElement.setAttribute('data-theme', theme);
})();
