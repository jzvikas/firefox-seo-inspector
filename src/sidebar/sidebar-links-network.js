'use strict';

const linkCheckState = {
  pageUrl: '',
  checking: false,
  operationId: null,
  report: null,
  error: null,
};

function linkOperationId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `links-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function syncLinkCheckState(pageUrlValue) {
  const value = String(pageUrlValue || '');
  if (linkCheckState.pageUrl === value) return;
  linkCheckState.pageUrl = value;
  linkCheckState.checking = false;
  linkCheckState.operationId = null;
  linkCheckState.report = null;
  linkCheckState.error = null;
}

async function runBoundedLinkCheck(links) {
  if (linkCheckState.checking) return;
  linkCheckState.checking = true;
  linkCheckState.error = null;
  linkCheckState.report = null;
  linkCheckState.operationId = linkOperationId();
  renderLinks();

  try {
    const urls = links.filter((item) => item.kind === 'http').map((item) => item.href);
    const response = await browser.runtime.sendMessage({
      type: 'seoInspector.checkLinksBounded',
      operationId: linkCheckState.operationId,
      urls,
    });
    linkCheckState.report = response;
    state.linkResults = new Map(
      (response.results || []).map((item) => [SeoCore.normalizedUrl(item.url), item]),
    );
  } catch (_error) {
    linkCheckState.error = 'Link status check failed.';
  } finally {
    linkCheckState.checking = false;
    linkCheckState.operationId = null;
    renderLinks();
  }
}

async function cancelBoundedLinkCheck() {
  if (!linkCheckState.operationId) return;
  await browser.runtime.sendMessage({
    type: 'seoInspector.cancelLinks',
    operationId: linkCheckState.operationId,
  }).catch(() => {});
}

function linkStatusText(result) {
  if (!result) return '—';
  if (result.error) return result.error;
  return `${result.status || '—'}${result.redirected ? ' →' : ''}`;
}

function linkTypeText(link, result) {
  if (link.kind !== 'http') return link.kind;
  const base = link.internal ? 'Internal' : 'External';
  if (result && result.redirected) return `${base} · REDIRECT`;
  return base;
}

renderLinks = function renderLinksBounded() {
  const panel = document.getElementById('links');
  clear(panel);
  if (!state.report) return panel.appendChild(el('div', 'empty', 'No audit data.'));

  const links = state.report.facts.links;
  syncLinkCheckState(state.report.facts.url);
  const toolbar = el('div', 'toolbar');
  const checkButton = el('button', '', linkCheckState.checking ? 'Checking…' : linkCheckState.report ? 'Check again' : 'Check HTTP status');
  checkButton.type = 'button';
  checkButton.disabled = linkCheckState.checking;
  checkButton.addEventListener('click', () => runBoundedLinkCheck(links));
  toolbar.appendChild(checkButton);

  if (linkCheckState.checking) {
    const cancelButton = el('button', '', 'Cancel');
    cancelButton.type = 'button';
    cancelButton.addEventListener('click', () => cancelBoundedLinkCheck());
    toolbar.appendChild(cancelButton);
  }

  if (state.linkResults.size) {
    const summary = LinkNetwork.summarize(links, Array.from(state.linkResults.values()));
    toolbar.appendChild(badge(`${summary.broken} broken`, summary.broken ? 'critical' : 'ok'));
    toolbar.appendChild(badge(`${summary.redirect} redirects`, summary.redirect ? 'warning' : 'ok'));
    toolbar.appendChild(badge(`${summary.internalRedirect} internal redirects`, summary.internalRedirect ? 'warning' : 'ok'));
    toolbar.appendChild(badge(`${summary.unknown} unknown`, summary.unknown ? 'warning' : 'ok'));
  }

  if (linkCheckState.report) {
    const response = linkCheckState.report;
    toolbar.appendChild(badge(`${response.checked || 0}/${response.requested || 0} checked`, 'ok'));
    if (response.capped) toolbar.appendChild(badge('250 URL limit reached', 'warning'));
    if (response.timedOut) toolbar.appendChild(badge('Scan timed out', 'warning'));
    if (response.cancelled) toolbar.appendChild(badge('Cancelled', 'warning'));
  }
  panel.appendChild(toolbar);

  if (linkCheckState.checking) {
    panel.appendChild(el('div', 'muted', 'Bounded link check running · max 250 unique URLs · 6 concurrent · 10 s/request · 30 s total.'));
  }
  if (linkCheckState.error) {
    const errorNode = el('div', 'issue critical');
    errorNode.appendChild(el('div', 'issue-title', linkCheckState.error));
    panel.appendChild(errorNode);
  }

  const wrap = el('div', 'table-wrap');
  const table = document.createElement('table');
  const head = document.createElement('thead');
  const hrow = document.createElement('tr');
  ['Status', 'Type', 'Anchor', 'URL'].forEach((value) => hrow.appendChild(el('th', '', value)));
  head.appendChild(hrow);
  table.appendChild(head);
  const body = document.createElement('tbody');

  links.slice(0, 500).forEach((link) => {
    const row = document.createElement('tr');
    const status = statusForLink(link);
    row.appendChild(el('td', '', linkStatusText(status)));
    row.appendChild(el('td', '', linkTypeText(link, status)));
    row.appendChild(el('td', '', link.label || '(empty)'));
    row.appendChild(el('td', 'cell-url code', link.href || link.rawHref));
    body.appendChild(row);
  });

  table.appendChild(body);
  wrap.appendChild(table);
  panel.appendChild(wrap);
  if (links.length > 500) panel.appendChild(el('div', 'muted', `Showing first 500 of ${links.length} links.`));
};

window.addEventListener('unload', () => {
  if (!linkCheckState.operationId) return;
  browser.runtime.sendMessage({
    type: 'seoInspector.cancelLinks',
    operationId: linkCheckState.operationId,
  }).catch(() => {});
});
