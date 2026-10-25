/* Shared light/dark preference before first paint. */
try {
  const mode = localStorage.getItem('jjSharedTheme') || localStorage.getItem('pressManagerTheme') || localStorage.getItem('theme') || 'light';
  document.documentElement.setAttribute('data-theme', mode === 'dark' ? 'dark' : 'light');
} catch (_) {}
