'use strict';

const UiState = (() => {
  const STATES = Object.freeze({
    EMPTY: 'empty',
    LOADING: 'loading',
    ERROR: 'error',
    DISABLED: 'disabled',
    COMPLETE: 'complete',
  });

  const LOADING_PATTERN = /\b(loading|analyzing|checking|running|fetching|scanning|inspecting|processing)\b/i;
  const ERROR_PATTERN = /\b(error|failed|cannot|could not|did not complete|unavailable|timed out|timeout)\b/i;
  const DISABLED_PATTERN = /\b(disabled|not available|unsupported|not enabled)\b/i;
  const EMPTY_PATTERN = /\b(no |none\b|not checked|nothing to|waiting for)\b/i;

  function text(node) {
    return String(node && node.textContent || '').replace(/\s+/g, ' ').trim();
  }

  function classify(panel) {
    if (!panel) return STATES.EMPTY;
    const value = text(panel);
    if (!value) return STATES.EMPTY;
    if (panel.querySelector('[aria-busy="true"]') || LOADING_PATTERN.test(value)) return STATES.LOADING;
    if (panel.querySelector('.issue.critical, .issue.warning') && ERROR_PATTERN.test(value)) return STATES.ERROR;
    if (ERROR_PATTERN.test(value)) return STATES.ERROR;
    if (DISABLED_PATTERN.test(value)) return STATES.DISABLED;
    if (panel.querySelector('.empty') || EMPTY_PATTERN.test(value)) return STATES.EMPTY;
    return STATES.COMPLETE;
  }

  function apply(panel) {
    if (!panel || !panel.classList || !panel.classList.contains('panel')) return;
    const state = classify(panel);
    panel.dataset.uiState = state;
    panel.setAttribute('aria-busy', state === STATES.LOADING ? 'true' : 'false');

    const liveNode = panel.querySelector('.empty, .issue');
    if (liveNode && !liveNode.hasAttribute('role')) {
      liveNode.setAttribute('role', state === STATES.ERROR ? 'alert' : 'status');
    }
    if (liveNode && !liveNode.hasAttribute('aria-live')) {
      liveNode.setAttribute('aria-live', state === STATES.ERROR ? 'assertive' : 'polite');
    }

    panel.querySelectorAll('button').forEach((button) => {
      const label = text(button);
      if (/^retry$/i.test(label) && !button.getAttribute('aria-label')) {
        button.setAttribute('aria-label', 'Retry this inspection');
      }
    });
  }

  function applyAll(root) {
    (root || document).querySelectorAll('.panel').forEach(apply);
  }

  function start(root) {
    const target = root || document;
    applyAll(target);
    if (typeof MutationObserver !== 'function') return null;
    const observer = new MutationObserver((mutations) => {
      const panels = new Set();
      mutations.forEach((mutation) => {
        const panel = mutation.target && mutation.target.closest ? mutation.target.closest('.panel') : null;
        if (panel) panels.add(panel);
        mutation.addedNodes.forEach((node) => {
          if (!node || node.nodeType !== 1) return;
          if (node.classList && node.classList.contains('panel')) panels.add(node);
          if (node.querySelectorAll) node.querySelectorAll('.panel').forEach((item) => panels.add(item));
        });
      });
      panels.forEach(apply);
    });
    observer.observe(target.body || target.documentElement || target, { childList: true, subtree: true, characterData: true });
    return observer;
  }

  return Object.freeze({ STATES, classify, apply, applyAll, start });
})();

UiState.start(document);
