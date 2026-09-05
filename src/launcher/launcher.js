'use strict';

(async () => {
  const status = document.getElementById('status');
  try {
    const tabs = await browser.tabs.query({ active: true, currentWindow: true });
    const tab = tabs[0] || null;
    const result = await browser.runtime.sendMessage({
      type: 'seoInspector.openWindow',
      tabId: tab && Number.isInteger(tab.id) ? tab.id : null,
    });
    if (!result || result.ok !== true) throw new Error('Could not open inspector window.');
    window.close();
  } catch (_error) {
    if (status) status.textContent = 'Could not open SEO Inspector.';
  }
})();
