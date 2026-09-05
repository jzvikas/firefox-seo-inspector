'use strict';

const canonicalChainState = {
  pageUrl: '',
  canonicalUrl: '',
  report: null,
  checking: false,
  operationId: null,
  error: null,
};

function canonicalChainOperationId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `canonical-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function syncCanonicalChainState(page, canonical) {
  const pageUrlValue = String(page || '');
  const canonicalUrlValue = String(canonical || '');
  if (canonicalChainState.pageUrl === pageUrlValue && canonicalChainState.canonicalUrl === canonicalUrlValue) return;
  canonicalChainState.pageUrl = pageUrlValue;
  canonicalChainState.canonicalUrl = canonicalUrlValue;
  canonicalChainState.report = null;
  canonicalChainState.checking = false;
  canonicalChainState.operationId = null;
  canonicalChainState.error = null;
}

function canonicalStatus(value) {
  const status = Number(value) || 0;
  if (!status) return '—';
  return String(status);
}

function canonicalIssueNode(item) {
  const severity = item && item.severity === 'critical' ? 'critical' : 'warning';
  const node = el('div', `issue ${severity}`);
  node.appendChild(el('div', 'issue-title', item && item.message ? item.message : 'Canonical chain issue'));
  if (item && item.code) node.appendChild(el('div', 'issue-message code', item.code));
  return node;
}

async function runCanonicalChainCheck(pageUrlValue, canonicalUrlValue) {
  if (canonicalChainState.checking || !canonicalUrlValue) return;
  canonicalChainState.checking = true;
  canonicalChainState.error = null;
  canonicalChainState.report = null;
  canonicalChainState.operationId = canonicalChainOperationId();
  renderIndexability();

  try {
    canonicalChainState.report = await browser.runtime.sendMessage({
      type: 'seoInspector.checkCanonicalChain',
      operationId: canonicalChainState.operationId,
      pageUrl: pageUrlValue,
      canonicalUrl: canonicalUrlValue,
    });
  } catch (_error) {
    canonicalChainState.error = 'Canonical chain validation failed.';
  } finally {
    canonicalChainState.checking = false;
    canonicalChainState.operationId = null;
    renderIndexability();
  }
}

async function cancelCanonicalChainCheck() {
  if (!canonicalChainState.operationId) return;
  await browser.runtime.sendMessage({
    type: 'seoInspector.cancelCanonicalChain',
    operationId: canonicalChainState.operationId,
  }).catch(() => {});
}

function appendCanonicalLevel(cardNode, level, index) {
  const requested = level && level.requestedUrl ? level.requestedUrl : '—';
  const finalUrl = level && level.finalUrl ? level.finalUrl : requested;
  const status = level && level.error
    ? level.error
    : `${canonicalStatus(level && level.status)}${level && level.statusText ? ` ${level.statusText}` : ''}`.trim();
  const canonicals = level && Array.isArray(level.canonical) ? level.canonical : [];
  addRow(cardNode, `Level ${index + 1} HTTP`, status || '—');
  addRow(cardNode, `Level ${index + 1} requested`, requested, 'code');
  if (finalUrl !== requested) addRow(cardNode, `Level ${index + 1} final`, finalUrl, 'code');
  addRow(cardNode, `Level ${index + 1} canonical`, canonicals.length ? canonicals.join(' | ') : 'None', 'code');

  const redirects = level && Array.isArray(level.redirects) ? level.redirects : [];
  redirects.forEach((hop, hopIndex) => {
    addRow(
      cardNode,
      `L${index + 1} redirect ${hopIndex + 1}`,
      `HTTP ${hop.statusCode || '—'} · ${hop.from || '—'} → ${hop.to || '—'}`,
      'code',
    );
  });
}

function appendCanonicalChainCard(panel) {
  if (!state.report || !state.report.facts) return;
  const facts = state.report.facts;
  const pageUrlValue = facts.url || '';
  const canonicalUrlValue = facts.canonical && facts.canonical.href ? facts.canonical.href : '';
  syncCanonicalChainState(pageUrlValue, canonicalUrlValue);

  const node = el('div', 'card');
  node.appendChild(el('div', 'card-header', 'Advanced canonical chain'));
  addRow(node, 'Source URL', pageUrlValue || '—', 'code');
  addRow(node, 'Declared canonical', canonicalUrlValue || '—', 'code');

  if (!canonicalUrlValue) {
    node.appendChild(el('div', 'empty', 'No canonical URL is declared, so there is no target chain to trace.'));
    panel.appendChild(node);
    return;
  }

  const toolbar = el('div', 'toolbar');
  const checkButton = el('button', '', canonicalChainState.checking ? 'Tracing…' : canonicalChainState.report ? 'Trace again' : 'Trace canonical chain');
  checkButton.type = 'button';
  checkButton.disabled = canonicalChainState.checking;
  checkButton.addEventListener('click', () => runCanonicalChainCheck(pageUrlValue, canonicalUrlValue));
  toolbar.appendChild(checkButton);

  if (canonicalChainState.checking) {
    const cancelButton = el('button', '', 'Cancel');
    cancelButton.type = 'button';
    cancelButton.addEventListener('click', () => cancelCanonicalChainCheck());
    toolbar.appendChild(cancelButton);
  }
  node.appendChild(toolbar);

  if (canonicalChainState.checking) {
    node.appendChild(el('div', 'empty', 'Tracing canonical and HTTP redirect hops…'));
    panel.appendChild(node);
    return;
  }

  if (canonicalChainState.error) {
    node.appendChild(canonicalIssueNode({ severity: 'critical', code: 'ui-network-error', message: canonicalChainState.error }));
    panel.appendChild(node);
    return;
  }

  const report = canonicalChainState.report;
  if (!report) {
    node.appendChild(el('div', 'empty', 'On-demand only. Checks use credential-free requests with depth, byte, request-timeout, and total-scan limits.'));
    panel.appendChild(node);
    return;
  }

  addRow(node, 'Stable target', report.stable ? 'Yes' : 'No');
  addRow(node, 'Target HTTP', canonicalStatus(report.targetStatus));
  addRow(node, 'Final HTTP', canonicalStatus(report.finalStatus));
  addRow(node, 'Canonical hops', report.counts ? report.counts.canonicalHops : 0);
  addRow(node, 'HTTP redirect hops', report.counts ? report.counts.redirectHops : 0);
  addRow(node, 'Canonical loop', report.canonicalLoop ? 'DETECTED' : 'No');
  addRow(node, 'Redirect loop', report.redirectLoop ? 'DETECTED' : 'No');
  addRow(node, 'Depth capped', report.capped ? 'Yes' : 'No');
  addRow(node, 'Final URL', report.finalUrl || '—', 'code');
  addRow(node, 'Terminal canonical', report.terminalCanonical || 'None', 'code');

  const path = Array.isArray(report.path) ? report.path : [];
  if (path.length) addRow(node, 'Canonical path', path.join(' → '), 'code');

  const issues = Array.isArray(report.issues) ? report.issues : [];
  if (!issues.length) node.appendChild(el('div', 'empty', 'No canonical-chain problems detected.'));
  else issues.forEach((item) => node.appendChild(canonicalIssueNode(item)));

  const levels = Array.isArray(report.levels) ? report.levels : [];
  if (levels.length) {
    const details = document.createElement('details');
    const summary = document.createElement('summary');
    summary.textContent = `Trace details · ${levels.length} level${levels.length === 1 ? '' : 's'}`;
    details.appendChild(summary);
    const detailCard = el('div', 'card');
    levels.forEach((level, index) => appendCanonicalLevel(detailCard, level, index));
    details.appendChild(detailCard);
    node.appendChild(details);
  }

  panel.appendChild(node);
}

const renderIndexabilityWithoutCanonicalChain = renderIndexability;
renderIndexability = function renderIndexabilityWithCanonicalChain() {
  renderIndexabilityWithoutCanonicalChain();
  const panel = document.getElementById('indexability');
  if (panel) appendCanonicalChainCard(panel);
};

window.addEventListener('unload', () => {
  if (!canonicalChainState.operationId) return;
  browser.runtime.sendMessage({
    type: 'seoInspector.cancelCanonicalChain',
    operationId: canonicalChainState.operationId,
  }).catch(() => {});
});
