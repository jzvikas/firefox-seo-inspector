'use strict';

activeTab = async function detachedInspectorActiveTab() {
  const target = await browser.runtime.sendMessage({ type: 'seoInspector.getTargetTab' }).catch(() => null);
  return target && Number.isInteger(target.id) ? target : null;
};

browser.runtime.onMessage.addListener((message) => {
  if (message && message.type === 'seoInspector.targetChanged') {
    refresh().catch(() => {});
  }
});
