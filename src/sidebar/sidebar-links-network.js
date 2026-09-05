'use strict';

const LINK_RENDER_BATCH = 100;
const LINK_RENDER_MAX = 500;

const linkCheckState = {
  pageUrl: '',
  checking: false,
  operationId: null,
  report: null,
  error: null,
  progressChecked: 0,
  progressRequested: 0,
  filter: 'all',
  visibleLimit: LINK_RENDER_BATCH,
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
  linkCheckState.progressChecked = 0;
  linkCheckState.progressRequested = 0;
  linkCheckState.filter = 'all';
  linkCheckState.visibleLimit = LINK_RENDER_BATCH;
}

async function runBoundedLinkCheck(links, force) {
  if (linkCheckState.checking) return;
  linkCheckState.checking = true;
  linkCheckState.error = null;
  linkCheckState.report = null;
  linkCheckState.progressChecked = 0;
  linkCheckState.progressRequested = 0;
  linkCheckState.operationId = linkOperationId();
  renderLinks();

  try {
    const urls = links.filter((item) => item.kind === 'http').map((item) => item.href);
    const response = await browser.runtime.sendMessage({
      type: 'seoInspector.checkLinksBounded',
      operationId: linkCheckState.operationId,
      urls,
      force: Boolean(force),
    });
    linkCheckState.report = response;
    linkCheckState.progressChecked = response.checked || 0;
    linkCheckState.progressRequested = response.requested || 0;
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
  const parts = [link.internal ? 'Internal' : 'External'];
  if (result && result.redirected) parts.push('REDIRECT');
  if (link.nofollow) parts.push('nofollow');
  if (link.sponsored) parts.push('sponsored');
  if (link.ugc) parts.push('ugc');
  return parts.join(' · ');
}

function appendLinkIntelligence(panel, links) {
  const audit = LinkAudit.analyze(links);
  const summary = el('div', 'card');
  summary.appendChild(el('div', 'card-header', 'Anchor intelligence'));
  const badges = el('div', 'toolbar');
  badges.appendChild(badge(`${audit.generic.length} generic anchors`, audit.generic.length ? 'warning' : 'ok'));
  badges.appendChild(badge(`${audit.empty.length} empty anchors`, audit.empty.length ? 'warning' : 'ok'));
  badges.appendChild(badge(`${audit.sameAnchorDifferentUrls.length} same-text conflicts`, audit.sameAnchorDifferentUrls.length ? 'warning' : 'ok'));
  badges.appendChild(badge(`${audit.differentAnchorsSameUrl.length} multi-text targets`, audit.differentAnchorsSameUrl.length ? 'warning' : 'ok'));
  summary.appendChild(badges);

  audit.sameAnchorDifferentUrls.slice(0, 5).forEach((group) => {
    addRow(summary, `“${group.label}”`, `${group.urls.length} different URLs`);
  });
  audit.differentAnchorsSameUrl.slice(0, 5).forEach((group) => {
    addRow(summary, group.url, `${group.labels.length} anchor texts`, 'code');
  });
  if (audit.sameAnchorDifferentUrls.length > 5 || audit.differentAnchorsSameUrl.length > 5) {
    summary.appendChild(el('div', 'muted', 'Showing the first 5 groups from each anchor-consistency category.'));
  }
  panel.appendChild(summary);
}

function appendLinkFilter(toolbar, links) {
  const select = document.createElement('select');
  select.setAttribute('aria-label', 'Filter links');
  const options = [
    ['all', 'All links'],
    ['broken', 'Broken'],
    ['redirecting', 'Redirecting'],
    ['external', 'External'],
    ['nofollow', 'Nofollow'],
    ['sponsored', 'Sponsored'],
    ['ugc', 'UGC'],
    ['generic', 'Generic anchor'],
  ];
  options.forEach(([value, label]) => {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = label;
    option.selected = linkCheckState.filter === value;
    select.appendChild(option);
  });
  select.addEventListener('change', () => {
    linkCheckState.filter = select.value;
    linkCheckState.visibleLimit = LINK_RENDER_BATCH;
    renderLinks();
  });
  toolbar.appendChild(select);

  const filtered = LinkAudit.filterLinks(links, state.linkResults, linkCheckState.filter);
  toolbar.appendChild(badge(`${filtered.length}/${links.length} match`, 'ok'));
}

function appendLinkRenderPager(panel, total) {
  const renderCap = Math.min(total, LINK_RENDER_MAX);
  const shown = Math.min(linkCheckState.visibleLimit, renderCap);
  if (shown < renderCap) {
    const controls = el('div', 'toolbar');
    const next = Math.min(LINK_RENDER_BATCH, renderCap - shown);
    const more = el('button', '', `Show next ${next} links`);
    more.type = 'button';
    more.addEventListener('click', () => {
      linkCheckState.visibleLimit = Math.min(LINK_RENDER_MAX, linkCheckState.visibleLimit + LINK_RENDER_BATCH);
      renderLinks();
    });
    controls.appendChild(more);
    controls.appendChild(el('span', 'muted', `Rendering ${shown} of ${total} matching links.`));
    panel.appendChild(controls);
    return;
  }
  if (total > LINK_RENDER_MAX) {
    panel.appendChild(el('div', 'muted', `Rendering is capped at ${LINK_RENDER_MAX} of ${total} matching links to keep the Inspector responsive. Full link data remains available to audit logic and exports.`));
  }
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
  checkButton.addEventListener('click', () => runBoundedLinkCheck(links, Boolean(linkCheckState.report)).catch((error) => handleAsyncUiFailure('link-check', error)));
  toolbar.appendChild(checkButton);

  if (linkCheckState.checking) {
    const cancelButton = el('button', '', 'Cancel');
    cancelButton.type = 'button';
    cancelButton.addEventListener('click', () => cancelBoundedLinkCheck().catch((error) => handleAsyncUiFailure('link-cancel', error)));
    toolbar.appendChild(cancelButton);
  }

  appendLinkFilter(toolbar, links);

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
    if (response.cached) toolbar.appendChild(badge(`${response.cached} cached`, 'ok'));
    if (response.capped) toolbar.appendChild(badge('250 URL limit reached', 'warning'));
    if (response.timedOut) toolbar.appendChild(badge('Scan timed out', 'warning'));
    if (response.cancelled) toolbar.appendChild(badge('Cancelled', 'warning'));
  }
  panel.appendChild(toolbar);

  if (linkCheckState.checking) {
    const progressMax = Math.max(1, linkCheckState.progressRequested || 1);
    const progress = document.createElement('progress');
    progress.max = progressMax;
    progress.value = Math.min(progressMax, linkCheckState.progressChecked || 0);
    panel.appendChild(progress);
    panel.appendChild(el('div', 'muted', `${linkCheckState.progressChecked}/${linkCheckState.progressRequested || '…'} checked · max 250 unique URLs · 6 concurrent · 10 s/request · 30 s total.`));
  }
  if (linkCheckState.error) {
    const errorNode = el('div', 'issue critical');
    errorNode.appendChild(el('div', 'issue-title', linkCheckState.error));
    panel.appendChild(errorNode);
  }

  appendLinkIntelligence(panel, links);

  if ((linkCheckState.filter === 'broken' || linkCheckState.filter === 'redirecting') && !state.linkResults.size) {
    panel.appendChild(el('div', 'empty', 'Run the HTTP status check first to use this network-status filter.'));
  }

  const filteredLinks = LinkAudit.filterLinks(links, state.linkResults, linkCheckState.filter);
  const wrap = el('div', 'table-wrap');
  const table = document.createElement('table');
  const head = document.createElement('thead');
  const hrow = document.createElement('tr');
  ['Status', 'Type', 'Anchor', 'URL'].forEach((value) => hrow.appendChild(el('th', '', value)));
  head.appendChild(hrow);
  table.appendChild(head);
  const body = document.createElement('tbody');

  const renderLimit = Math.min(linkCheckState.visibleLimit, LINK_RENDER_MAX);
  filteredLinks.slice(0, renderLimit).forEach((link) => {
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
  if (!filteredLinks.length) panel.appendChild(el('div', 'empty', 'No links match this filter.'));
  else appendLinkRenderPager(panel, filteredLinks.length);
};

browser.runtime.onMessage.addListener((message) => {
  if (!message || message.type !== 'seoInspector.linkCheckProgress') return undefined;
  if (!linkCheckState.checking || message.operationId !== linkCheckState.operationId) return undefined;
  linkCheckState.progressChecked = Number(message.checked) || 0;
  linkCheckState.progressRequested = Number(message.requested) || 0;
  if (message.result && message.result.url) {
    state.linkResults.set(SeoCore.normalizedUrl(message.result.url), message.result);
  }
  if (linkCheckState.progressChecked === linkCheckState.progressRequested || linkCheckState.progressChecked % 25 === 0) renderLinks();
  return undefined;
});

window.addEventListener('unload', () => {
  if (!linkCheckState.operationId) return;
  browser.runtime.sendMessage({
    type: 'seoInspector.cancelLinks',
    operationId: linkCheckState.operationId,
  }).catch(() => {});
});
