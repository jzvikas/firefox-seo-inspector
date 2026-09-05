'use strict';

function renderAll() {
  renderHeader();
  renderOverview();
  renderIndexability();
  renderPerformance();
  renderPerformanceHints();
  renderAssetAudit();
  renderThirdPartyAudit();
  renderContent();
  renderSecurity();
  renderSerp();
  renderHreflang();
  renderIssues();
  renderHeadings();
  renderLinks();
  renderImagesNetwork();
  renderProduct();
  renderCategory();
  renderSchema();
  renderSocial();
  renderCompare();
  renderRules();
  renderProfiles();
  renderMultiTab();
  renderCrawler();
}

function activateTab(name) {
  document.querySelectorAll('.tab').forEach((button) => button.classList.toggle('active', button.dataset.tab === name));
  document.querySelectorAll('.panel').forEach((panel) => panel.classList.toggle('active', panel.id === name));
}

document.querySelectorAll('.tab').forEach((button) => button.addEventListener('click', () => activateTab(button.dataset.tab)));
document.getElementById('refreshButton').addEventListener('click', () => refresh().catch(() => {}));

document.getElementById('copyIssuesButton').addEventListener('click', async () => {
  if (!state.report) return;
  const lines = state.report.evaluation.issues.map((item) => `[${item.severity.toUpperCase()}] ${item.title}: ${item.message}`);
  await navigator.clipboard.writeText(lines.join('\n')).catch(() => {});
});

document.getElementById('exportButton').addEventListener('click', () => {
  if (!state.report) return;
  const payload = JSON.stringify(state.report, null, 2);
  const blob = new Blob([payload], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = 'seo-inspector-report.json';
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});

browser.tabs.onActivated.addListener(() => refresh().catch(() => {}));
browser.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (tabId === state.tabId && (changeInfo.status === 'complete' || changeInfo.url)) refresh().catch(() => {});
});

browser.runtime.onMessage.addListener((message, sender) => {
  if (message && message.type === 'seoInspector.pageChanged' && sender && sender.tab && sender.tab.id === state.tabId) {
    refresh().catch(() => {});
  }
});

window.addEventListener('unload', () => {
  if (typeof state.tabId === 'number') browser.tabs.sendMessage(state.tabId, { type: 'seoInspector.watch', enabled: false }).catch(() => {});
  if (crawlerState && crawlerState.running) browser.runtime.sendMessage({ type: 'seoInspector.crawler.cancel', scanId: String(crawlerState.scanId) }).catch(() => {});
});

refresh().catch(() => setStatus('Unable to start', 'Try reopening the Inspector window.'));
