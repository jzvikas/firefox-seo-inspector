(() => {
  'use strict';

  const button = document.getElementById('windowSizeButton');
  if (!button || typeof browser === 'undefined' || !browser.windows) return;

  let inspectorWindowId = null;
  let currentState = 'normal';

  function isExpanded(state) {
    return state === 'maximized' || state === 'fullscreen';
  }

  function render(state) {
    currentState = String(state || 'normal');
    const expanded = isExpanded(currentState);
    const label = expanded ? 'Restore window' : 'Maximize window';
    button.textContent = expanded ? '❐' : '□';
    button.title = label;
    button.setAttribute('aria-label', label);
    button.setAttribute('aria-pressed', expanded ? 'true' : 'false');
  }

  async function readCurrentWindow() {
    const windowInfo = await browser.windows.getCurrent();
    if (!windowInfo || !Number.isInteger(windowInfo.id)) throw new Error('Inspector window is unavailable.');
    inspectorWindowId = windowInfo.id;
    render(windowInfo.state);
    return windowInfo;
  }

  async function toggleWindowSize() {
    button.disabled = true;
    try {
      const windowInfo = await readCurrentWindow();
      const nextState = isExpanded(windowInfo.state) ? 'normal' : 'maximized';
      const updated = await browser.windows.update(windowInfo.id, { state: nextState });
      render(updated && updated.state ? updated.state : nextState);
    } finally {
      button.disabled = false;
    }
  }

  button.addEventListener('click', () => {
    toggleWindowSize().catch(() => {});
  });

  if (browser.windows.onBoundsChanged && typeof browser.windows.onBoundsChanged.addListener === 'function') {
    browser.windows.onBoundsChanged.addListener((windowInfo) => {
      if (!windowInfo || windowInfo.id !== inspectorWindowId) return;
      render(windowInfo.state || currentState);
    });
  }

  readCurrentWindow().catch(() => {
    button.hidden = true;
  });
})();
