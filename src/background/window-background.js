(() => {
  'use strict';

  const STATE_KEY = 'inspector-window:v1';
  const INSPECTOR_PAGE = 'sidebar/sidebar.html';
  const DEFAULT_WIDTH = 1040;
  const DEFAULT_HEIGHT = 900;
  const state = { loaded: false, windowId: null, targetTabId: null };

  function numericId(value) {
    return Number.isInteger(value) && value >= 0 ? value : null;
  }

  function inspectorPageUrl() {
    return browser.runtime.getURL(INSPECTOR_PAGE);
  }

  async function ensureState() {
    if (state.loaded) return state;
    const stored = await browser.storage.session.get(STATE_KEY).catch(() => ({}));
    const saved = stored && stored[STATE_KEY] ? stored[STATE_KEY] : {};
    state.windowId = numericId(saved.windowId);
    state.targetTabId = numericId(saved.targetTabId);
    state.loaded = true;
    return state;
  }

  async function persistState() {
    await browser.storage.session.set({
      [STATE_KEY]: {
        windowId: numericId(state.windowId),
        targetTabId: numericId(state.targetTabId),
      },
    }).catch(() => {});
  }

  async function tabById(tabId) {
    const id = numericId(tabId);
    if (id === null) return null;
    return browser.tabs.get(id).catch(() => null);
  }

  async function fallbackTargetTab() {
    const windows = await browser.windows.getAll({ populate: true, windowTypes: ['normal'] }).catch(() => []);
    const preferred = windows.find((item) => item && item.focused) || windows[0] || null;
    if (!preferred || !Array.isArray(preferred.tabs)) return null;
    return preferred.tabs.find((tab) => tab && tab.active) || null;
  }

  async function currentTargetTab() {
    await ensureState();
    let tab = await tabById(state.targetTabId);
    if (!tab) {
      tab = await fallbackTargetTab();
      state.targetTabId = tab ? numericId(tab.id) : null;
      await persistState();
    }
    return tab;
  }

  async function broadcastTargetChanged(tabId) {
    await browser.runtime.sendMessage({
      type: 'seoInspector.targetChanged',
      tabId: numericId(tabId),
    }).catch(() => {});
  }

  async function setTargetTab(tabId, notify) {
    await ensureState();
    const tab = await tabById(tabId);
    state.targetTabId = tab ? numericId(tab.id) : null;
    await persistState();
    if (notify !== false) await broadcastTargetChanged(state.targetTabId);
    return tab;
  }

  function hasLiveInspectorPage(windowInfo) {
    if (!windowInfo || !Array.isArray(windowInfo.tabs)) return false;
    const expected = inspectorPageUrl();
    return windowInfo.tabs.some((tab) => tab && tab.url === expected);
  }

  async function discardStaleInspectorWindow(windowInfo) {
    const staleId = windowInfo ? numericId(windowInfo.id) : numericId(state.windowId);
    state.windowId = null;
    await persistState();
    if (staleId !== null) {
      await browser.windows.remove(staleId).catch(() => {});
    }
  }

  async function existingInspectorWindow() {
    await ensureState();
    const id = numericId(state.windowId);
    if (id === null) return null;
    const windowInfo = await browser.windows.get(id, { populate: true }).catch(() => null);
    if (!windowInfo) {
      state.windowId = null;
      await persistState();
      return null;
    }
    if (!hasLiveInspectorPage(windowInfo)) {
      await discardStaleInspectorWindow(windowInfo);
      return null;
    }
    return windowInfo;
  }

  async function openInspectorWindow(tabId) {
    const target = await setTargetTab(tabId, false);
    const existing = await existingInspectorWindow();
    if (existing) {
      await browser.windows.update(existing.id, { focused: true });
      await broadcastTargetChanged(state.targetTabId);
      return { ok: true, created: false, windowId: existing.id, targetTabId: state.targetTabId };
    }

    const created = await browser.windows.create({
      url: inspectorPageUrl(),
      type: 'popup',
      focused: true,
      width: DEFAULT_WIDTH,
      height: DEFAULT_HEIGHT,
    });
    state.windowId = created && numericId(created.id);
    if (state.windowId === null) throw new Error('Inspector window was not created.');
    await persistState();
    await broadcastTargetChanged(target ? target.id : null);
    return { ok: true, created: true, windowId: state.windowId, targetTabId: state.targetTabId };
  }

  async function followActivatedTab(activeInfo) {
    await ensureState();
    if (state.windowId === null || !activeInfo) return;
    if (numericId(activeInfo.windowId) === state.windowId) return;
    await setTargetTab(activeInfo.tabId, true);
  }

  async function followFocusedWindow(windowId) {
    await ensureState();
    const id = numericId(windowId);
    if (state.windowId === null || id === null || id === state.windowId) return;
    const tabs = await browser.tabs.query({ active: true, windowId: id }).catch(() => []);
    if (tabs[0]) await setTargetTab(tabs[0].id, true);
  }

  async function followTargetUpdate(tabId, changeInfo) {
    await ensureState();
    if (numericId(tabId) !== state.targetTabId) return;
    if (!changeInfo || (!changeInfo.url && changeInfo.status !== 'complete')) return;
    await broadcastTargetChanged(state.targetTabId);
  }

  async function handleTargetRemoved(tabId) {
    await ensureState();
    if (numericId(tabId) !== state.targetTabId) return;
    state.targetTabId = null;
    const replacement = await fallbackTargetTab();
    if (replacement) state.targetTabId = numericId(replacement.id);
    await persistState();
    await broadcastTargetChanged(state.targetTabId);
  }

  browser.runtime.onMessage.addListener((message) => {
    if (!message || typeof message !== 'object') return undefined;
    if (message.type === 'seoInspector.openWindow') return openInspectorWindow(message.tabId);
    if (message.type === 'seoInspector.getTargetTab') return currentTargetTab();
    return undefined;
  });

  browser.tabs.onActivated.addListener((activeInfo) => {
    followActivatedTab(activeInfo).catch(() => {});
  });

  browser.tabs.onUpdated.addListener((tabId, changeInfo) => {
    followTargetUpdate(tabId, changeInfo).catch(() => {});
  });

  browser.tabs.onRemoved.addListener((tabId) => {
    handleTargetRemoved(tabId).catch(() => {});
  });

  browser.windows.onFocusChanged.addListener((windowId) => {
    followFocusedWindow(windowId).catch(() => {});
  });

  browser.windows.onRemoved.addListener((windowId) => {
    ensureState().then(async () => {
      if (numericId(windowId) !== state.windowId) return;
      state.windowId = null;
      await persistState();
    }).catch(() => {});
  });
})();
