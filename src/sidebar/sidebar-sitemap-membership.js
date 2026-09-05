'use strict';

const sitemapMembershipState = {
  pageUrl: '',
  canonicalUrl: '',
  report: null,
  checking: false,
  operationId: null,
  error: null,
};

function sitemapMembershipOperationId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `sitemap-membership-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function syncSitemapMembershipState(page, canonical) {
  const pageUrlValue = String(page || '');
  const canonicalUrlValue = String(canonical || page || '');
  if (sitemapMembershipState.pageUrl === pageUrlValue && sitemapMembershipState.canonicalUrl === canonicalUrlValue) return;
  sitemapMembershipState.pageUrl = pageUrlValue;
  sitemapMembershipState.canonicalUrl = canonicalUrlValue;
  sitemapMembershipState.report = null;
  sitemapMembershipState.checking = false;
  sitemapMembershipState.operationId = null;
  sitemapMembershipState.error = null;
}

function sitemapMembershipBytes(value) {
  const bytes = Number(value) || 0;
  if (!bytes) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function sitemapMembershipIssueNode(item) {
  const severity = item && item.severity === 'critical' ? 'critical' : 'warning';
  const node = el('div', `issue ${severity}`);
  node.appendChild(el('div', 'issue-title', item && item.message ? item.message : 'Sitemap conflict'));
  if (item && item.code) node.appendChild(el('div', 'issue-message code', item.code));
  return node;
}

async function runSitemapMembership(pageUrlValue, canonicalUrlValue) {
  if (sitemapMembershipState.checking) return;
  sitemapMembershipState.checking = true;
  sitemapMembershipState.error = null;
  sitemapMembershipState.report = null;
  sitemapMembershipState.operationId = sitemapMembershipOperationId();
  renderIndexability();

  try {
    sitemapMembershipState.report = await browser.runtime.sendMessage({
      type: 'seoInspector.checkSitemapMembership',
      operationId: sitemapMembershipState.operationId,
      pageUrl: pageUrlValue,
      canonicalUrl: canonicalUrlValue,
      sitemapUrls: state.robotsReport && Array.isArray(state.robotsReport.sitemaps)
        ? state.robotsReport.sitemaps
        : [],
    });
  } catch (_error) {
    sitemapMembershipState.error = 'Sitemap membership scan failed.';
  } finally {
    sitemapMembershipState.checking = false;
    sitemapMembershipState.operationId = null;
    renderIndexability();
  }
}

async function cancelSitemapMembership() {
  if (!sitemapMembershipState.operationId) return;
  await browser.runtime.sendMessage({
    type: 'seoInspector.cancelSitemapMembership',
    operationId: sitemapMembershipState.operationId,
  }).catch(() => {});
}

function removeLegacySitemapCard(panel) {
  const cards = panel.querySelectorAll('.card');
  for (const node of cards) {
    const header = node.querySelector('.card-header');
    if (header && header.textContent.trim() === 'Sitemap membership') {
      node.remove();
      return;
    }
  }
}

function appendSitemapDocuments(node, report) {
  const documents = report && Array.isArray(report.documents) ? report.documents : [];
  if (!documents.length) return;
  const details = document.createElement('details');
  const summary = document.createElement('summary');
  summary.textContent = `Scanned sitemap documents · ${documents.length}`;
  details.appendChild(summary);
  const detailCard = el('div', 'card');
  documents.slice(0, 12).forEach((item, index) => {
    const stateText = item.error
      ? item.error
      : `${item.status || '—'} · ${item.type || 'unknown'} · ${item.entries || 0} entries`;
    addRow(detailCard, `#${index + 1}`, `${stateText} · ${item.url || item.requestedUrl || ''}`, 'code');
  });
  if (documents.length > 12) addRow(detailCard, 'More', `${documents.length - 12} additional documents scanned.`);
  details.appendChild(detailCard);
  node.appendChild(details);
}

function appendSitemapMembershipCard(panel) {
  if (!state.report || !state.report.facts) return;
  const facts = state.report.facts;
  const pageUrlValue = facts.url || '';
  const canonicalUrlValue = facts.canonical && facts.canonical.href ? facts.canonical.href : pageUrlValue;
  syncSitemapMembershipState(pageUrlValue, canonicalUrlValue);

  const node = el('div', 'card');
  node.appendChild(el('div', 'card-header', 'Sitemap membership & conflicts'));
  addRow(node, 'Source URL', pageUrlValue || '—', 'code');
  addRow(node, 'Canonical URL', canonicalUrlValue || '—', 'code');
  addRow(
    node,
    'Discovery',
    state.robotsReport && Array.isArray(state.robotsReport.sitemaps) && state.robotsReport.sitemaps.length
      ? `${state.robotsReport.sitemaps.length} robots.txt declaration(s)`
      : 'Fallback /sitemap.xml',
  );

  const toolbar = el('div', 'toolbar');
  const checkButton = el('button', '', sitemapMembershipState.checking ? 'Scanning…' : sitemapMembershipState.report ? 'Check again' : 'Check sitemap membership');
  checkButton.type = 'button';
  checkButton.disabled = sitemapMembershipState.checking;
  checkButton.addEventListener('click', () => runSitemapMembership(pageUrlValue, canonicalUrlValue));
  toolbar.appendChild(checkButton);

  if (sitemapMembershipState.checking) {
    const cancelButton = el('button', '', 'Cancel');
    cancelButton.type = 'button';
    cancelButton.addEventListener('click', () => cancelSitemapMembership());
    toolbar.appendChild(cancelButton);
  }
  node.appendChild(toolbar);

  if (sitemapMembershipState.checking) {
    node.appendChild(el('div', 'empty', 'Scanning source and canonical membership in the bounded sitemap set…'));
    panel.appendChild(node);
    return;
  }

  if (sitemapMembershipState.error) {
    node.appendChild(sitemapMembershipIssueNode({ severity: 'critical', code: 'ui-network-error', message: sitemapMembershipState.error }));
    panel.appendChild(node);
    return;
  }

  const report = sitemapMembershipState.report;
  if (!report) {
    node.appendChild(el('div', 'empty', 'On-demand only. Source and canonical URLs are checked in one bounded, cancellable scan.'));
    panel.appendChild(node);
    return;
  }

  const source = report.source || { url: pageUrlValue, found: false, match: null };
  const canonical = report.canonical || { url: canonicalUrlValue, found: false, match: null };
  addRow(node, 'Source in sitemap', source.found ? 'Yes' : 'No');
  if (source.match) {
    addRow(node, 'Source sitemap', source.match.sitemapUrl || '—', 'code');
    addRow(node, 'Source lastmod', source.match.lastmod || '—');
  }
  addRow(node, report.sameTarget ? 'Canonical in sitemap' : 'Canonical target in sitemap', canonical.found ? 'Yes' : 'No');
  if (canonical.match) {
    addRow(node, 'Canonical sitemap', canonical.match.sitemapUrl || '—', 'code');
    addRow(node, 'Canonical lastmod', canonical.match.lastmod || '—');
  }
  addRow(node, 'Documents scanned', report.scannedDocuments || 0);
  addRow(node, 'Documents discovered', report.discoveredDocuments || (report.sitemaps ? report.sitemaps.length : 0));
  addRow(node, 'Decoded bytes', sitemapMembershipBytes(report.totalBytes));
  addRow(node, 'Depth/size capped', report.capped ? 'Yes' : 'No');
  if (report.error) addRow(node, 'Scan state', report.error);

  const indexability = state.report.evaluation && state.report.evaluation.indexability
    ? state.report.evaluation.indexability
    : null;
  const responseMeta = state.report.responseMeta || {};
  const analysis = SitemapMembership.analyze({
    pageUrl: pageUrlValue,
    canonicalUrl: canonicalUrlValue,
    sourceFound: Boolean(source.found),
    canonicalFound: Boolean(canonical.found),
    verdict: indexability ? indexability.verdict : '',
    statusCode: responseMeta.statusCode || 0,
    redirectHops: Array.isArray(responseMeta.redirectChain) ? responseMeta.redirectChain.length : 0,
  });

  if (!analysis.issues.length) {
    node.appendChild(el('div', 'empty', source.found && !report.sameTarget
      ? 'Membership found; no additional sitemap/indexability conflict was detected.'
      : 'No sitemap/indexability conflicts detected for the current URL.'));
  } else {
    analysis.issues.forEach((item) => node.appendChild(sitemapMembershipIssueNode(item)));
  }

  appendSitemapDocuments(node, report);
  panel.appendChild(node);
}

const renderIndexabilityBeforeSitemapMembership = renderIndexability;
renderIndexability = function renderIndexabilityWithSitemapMembership() {
  renderIndexabilityBeforeSitemapMembership();
  const panel = document.getElementById('indexability');
  if (!panel) return;
  removeLegacySitemapCard(panel);
  appendSitemapMembershipCard(panel);
};

window.addEventListener('unload', () => {
  if (!sitemapMembershipState.operationId) return;
  browser.runtime.sendMessage({
    type: 'seoInspector.cancelSitemapMembership',
    operationId: sitemapMembershipState.operationId,
  }).catch(() => {});
});
