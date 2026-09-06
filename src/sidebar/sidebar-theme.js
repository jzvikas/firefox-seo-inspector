'use strict';

(() => {
  const STORAGE_KEY = 'seoInspector.uiTheme';
  const ALLOWED = new Set(['system', 'light', 'dark']);

  function normalizeTheme(value) {
    const normalized = String(value || '').toLowerCase();
    return ALLOWED.has(normalized) ? normalized : 'system';
  }

  function applyTheme(value, root) {
    const theme = normalizeTheme(value);
    const target = root || document.documentElement;
    if (!target) return theme;
    if (theme === 'system') target.removeAttribute('data-theme');
    else target.setAttribute('data-theme', theme);
    target.style.colorScheme = theme === 'system' ? 'light dark' : theme;
    return theme;
  }

  async function readTheme(storage) {
    const area = storage || (typeof browser !== 'undefined' && browser.storage && browser.storage.local);
    if (!area || typeof area.get !== 'function') return 'system';
    try {
      const result = await area.get(STORAGE_KEY);
      return normalizeTheme(result && result[STORAGE_KEY]);
    } catch (_error) {
      return 'system';
    }
  }

  async function writeTheme(value, storage) {
    const theme = normalizeTheme(value);
    const area = storage || (typeof browser !== 'undefined' && browser.storage && browser.storage.local);
    if (!area || typeof area.set !== 'function') return theme;
    await area.set({ [STORAGE_KEY]: theme });
    return theme;
  }

  async function initTheme(options) {
    const opts = options || {};
    const select = opts.select || document.getElementById('themeSelect');
    const root = opts.root || document.documentElement;
    const storage = opts.storage || (typeof browser !== 'undefined' && browser.storage && browser.storage.local);
    const theme = applyTheme(await readTheme(storage), root);
    if (!select) return theme;

    select.value = theme;
    select.addEventListener('change', () => {
      const next = applyTheme(select.value, root);
      writeTheme(next, storage).catch(() => {});
    });
    return theme;
  }

  const api = { STORAGE_KEY, normalizeTheme, applyTheme, readTheme, writeTheme, initTheme };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof globalThis !== 'undefined') globalThis.SidebarTheme = api;

  if (typeof document !== 'undefined') {
    const start = () => initTheme().catch(() => {});
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
    else start();
  }
})();
