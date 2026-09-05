'use strict';

function verdictKind(verdict) {
  if (verdict === Indexability.VERDICTS.INDEXABLE) return 'ok';
  if (verdict === Indexability.VERDICTS.CANONICALIZED || verdict === Indexability.VERDICTS.REDIRECTED) return 'warning';
  return 'critical';
}

function canonicalCheckKey(url) {
  return `canonical:${Indexability.normalizeUrl(url)}`;
}

function currentCanonicalCheck(url) {
  if (!state.canonicalChecks) state.canonicalChecks = new Map();
  return state.canonicalChecks.get(canonicalCheckKey(url)) || null;
}

function setCanonicalCheck(url, result) {
  if (!state.canonicalChecks) state.canonicalChecks = new Map();
  state.canonicalChecks.set(canonicalCheckKey(url), result);
}

function formatDirectiveList(values) {
  return Array.isArray(values) && values.length ? values.join(', ') : '—';
}

function formatBytes(value) {
  const bytes = Number(value) || 0;
  if (!bytes) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function newOperationId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `sitemap-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

async function runSitemapScan(analysis) {
  if (state.sitemapChecking) return;
  const operationId = newOperationId();
  state.sitemapChecking = true;
  state.sitemapOperationId = operationId;
  state.sitemapReport = null;
  renderIndexability();
  try {
    state.sitemapReport = await browser.runtime.sendMessage({
      type: 'seoInspector.checkSitemaps',
      operationId,
      pageUrl: analysis.pageUrl,
      canonicalUrl: analysis.canonical.url || analysis.pageUrl,
      sitemapUrls: state.robotsReport ? state.robotsReport.sitemaps : [],
    });
  } catch (_error) {
    state.sitemapReport = { error: 'network', found: false, documents: [] };
  } finally {
    state.sitemapChecking = false;
    state.sitemapOperationId = null;
    renderIndexability();
  }
}

async function cancelSitemapScan() {
  if (!state.sitemapOperationId) return;
  await browser.runtime.sendMessage({
    type: 'seoInspector.cancelNetwork',
    operationId: state.sitemapOperationId,
  }).catch(() => {});
}

function renderRobotsCard(panel) {
  const robots = state.robotsReport;
  const robotsCard = el('div', 'card');
  robotsCard.appendChild(el('div', 'card-header', 'robots.txt · Googlebot'));
  if (!robots) {
    robotsCard.appendChild(el('div', 'empty', 'robots.txt could not be checked.'));
    panel.appendChild(robotsCard);
    return;
  }

  addRow(robotsCard, 'URL', robots.robotsUrl || '—', 'code');
  addRow(robotsCard, 'HTTP', robots.error ? robots.error : robots.status ? `${robots.status} ${robots.statusText || ''}`.trim() : 'Unavailable');
  addRow(robotsCard, 'Result', robots.blocked ? 'BLOCKED' : robots.allowed === true ? 'Allowed' : 'Unknown');
  addRow(robotsCard, 'Matching group', formatDirectiveList(robots.matchedAgents));
  addRow(robotsCard, 'Matching rule', robots.rule || 'No matching rule');
  addRow(robotsCard, 'Path checked', robots.path || '—', 'code');
  addRow(robotsCard, 'Sitemaps declared', robots.sitemaps ? robots.sitemaps.length : 0);
  addRow(robotsCard, 'Size', formatBytes(robots.sizeBytes));
  if (robots.redirected) addRow(robotsCard, 'Redirected to', robots.finalUrl || '—', 'code');
  if (robots.warnings && robots.warnings.length) {
    addRow(robotsCard, 'Parser warnings', robots.warnings.map((item) => item.message || String(item)).join(' | '));
  }

  const actions = el('div', 'toolbar');
  const openButton = el('button', '', 'Open robots.txt');
  openButton.type = 'button';
  openButton.addEventListener('click', () => {
    if (robots.robotsUrl) browser.tabs.create({ url: robots.robotsUrl }).catch(() => {});
  });
  actions.appendChild(openButton);
  robotsCard.appendChild(actions);
  panel.appendChild(robotsCard);
}

function renderSitemapCard(panel, analysis) {
  const sitemapCard = el('div', 'card');
  sitemapCard.appendChild(el('div', 'card-header', 'Sitemap membership'));
  const target = analysis.canonical.url || analysis.pageUrl;
  addRow(sitemapCard, 'Target', target || '—', 'code');
  addRow(
    sitemapCard,
    'Discovery',
    state.robotsReport && state.robotsReport.sitemaps && state.robotsReport.sitemaps.length
      ? `${state.robotsReport.sitemaps.length} robots.txt declaration(s)`
      : 'Fallback /sitemap.xml',
  );

  const actions = el('div', 'toolbar');
  if (state.sitemapChecking) {
    const cancelButton = el('button', '', 'Cancel sitemap scan');
    cancelButton.type = 'button';
    cancelButton.addEventListener('click', () => cancelSitemapScan().catch((error) => handleAsyncUiFailure('sitemap-cancel', error)));
    actions.appendChild(cancelButton);
    sitemapCard.appendChild(actions);
    sitemapCard.appendChild(el('div', 'empty', 'Scanning bounded sitemap set…'));
    panel.appendChild(sitemapCard);
    return;
  }

  const checkButton = el('button', '', state.sitemapReport ? 'Check sitemap again' : 'Check sitemap');
  checkButton.type = 'button';
  checkButton.addEventListener('click', () => runSitemapScan(analysis).catch((error) => handleAsyncUiFailure('sitemap-scan', error)));
  actions.appendChild(checkButton);
  sitemapCard.appendChild(actions);

  const result = state.sitemapReport;
  if (!result) {
    sitemapCard.appendChild(el('div', 'empty', 'On-demand only. The scan is capped by document count, bytes, and timeout.'));
    panel.appendChild(sitemapCard);
    return;
  }

  addRow(sitemapCard, 'Found', result.found ? 'Yes' : 'No');
  addRow(sitemapCard, 'Documents scanned', result.scannedDocuments || 0);
  addRow(sitemapCard, 'Documents discovered', result.discoveredDocuments || result.sitemaps && result.sitemaps.length || 0);
  addRow(sitemapCard, 'Transferred/decoded', formatBytes(result.totalBytes));
  addRow(sitemapCard, 'Capped', result.capped ? 'Yes' : 'No');
  if (result.error) addRow(sitemapCard, 'Scan state', result.error);
  if (result.match) {
    addRow(sitemapCard, 'Matched sitemap', result.match.sitemapUrl || '—', 'code');
    addRow(sitemapCard, 'Matched URL', result.match.loc || '—', 'code');
    addRow(sitemapCard, 'lastmod', result.match.lastmod || '—');
    if (analysis.verdict === Indexability.VERDICTS.NOINDEX || analysis.verdict === Indexability.VERDICTS.BLOCKED || analysis.verdict === Indexability.VERDICTS.ERROR) {
      addRow(sitemapCard, 'Conflict', `Sitemap contains the target while page verdict is ${analysis.verdict}.`);
    }
  }

  const documents = Array.isArray(result.documents) ? result.documents : [];
  documents.slice(0, 8).forEach((item, index) => {
    const stateText = item.error ? item.error : `${item.status || '—'} · ${item.type || 'unknown'} · ${item.entries || 0} entries`;
    addRow(sitemapCard, `#${index + 1}`, `${stateText} · ${item.url || item.requestedUrl || ''}`, 'code');
  });
  if (documents.length > 8) addRow(sitemapCard, 'More', `${documents.length - 8} additional sitemap documents scanned.`);
  panel.appendChild(sitemapCard);
}

function renderIndexability() {
  const panel = document.getElementById('indexability');
  clear(panel);
  if (!state.report) return panel.appendChild(el('div', 'empty', 'No audit data.'));

  const analysis = state.report.evaluation.indexability
    || Indexability.analyze(state.report.facts, state.report.responseMeta || null, { robotsTxt: state.robotsReport });
  const verdictCard = el('div', 'card');
  const header = el('div', 'card-header', 'Indexability verdict');
  header.appendChild(document.createTextNode(' '));
  header.appendChild(badge(analysis.verdict, verdictKind(analysis.verdict)));
  verdictCard.appendChild(header);
  analysis.reasons.forEach((item) => {
    addRow(verdictCard, item.label, item.detail || 'Detected');
  });

  const rawActions = el('div', 'toolbar');
  const rawButton = el('button', '', 'Compare raw HTML');
  rawButton.type = 'button';
  rawButton.addEventListener('click', () => {
    (async () => {
      rawButton.disabled = true;
      rawButton.textContent = 'Fetching…';
      try {
        const rawReport = await sendToTab({ type: 'seoInspector.fetchRaw' });
        const rawAnalysis = Indexability.analyze(
          rawReport.facts,
          rawReport.responseMeta || null,
          { robotsTxt: state.robotsReport },
        );
        state.indexabilityRawDiff = Indexability.diff(analysis, rawAnalysis);
      } catch (_error) {
        state.indexabilityRawDiff = null;
      }
      renderIndexability();
    })().catch((error) => handleAsyncUiFailure('indexability-raw-compare', error));
  });
  rawActions.appendChild(rawButton);
  verdictCard.appendChild(rawActions);
  panel.appendChild(verdictCard);

  const rawDiffCard = el('div', 'card');
  rawDiffCard.appendChild(el('div', 'card-header', 'Rendered DOM vs raw HTML'));
  if (state.indexabilityRawDiff === null) rawDiffCard.appendChild(el('div', 'empty', 'Raw indexability comparison failed.'));
  else if (Array.isArray(state.indexabilityRawDiff) && !state.indexabilityRawDiff.length) rawDiffCard.appendChild(el('div', 'empty', 'No indexability differences found.'));
  else if (Array.isArray(state.indexabilityRawDiff)) {
    state.indexabilityRawDiff.forEach((change) => {
      addRow(rawDiffCard, change.field, `Rendered: ${formatDirectiveList(Array.isArray(change.rendered) ? change.rendered : [change.rendered])} | Raw: ${formatDirectiveList(Array.isArray(change.raw) ? change.raw : [change.raw])}`);
    });
  } else rawDiffCard.appendChild(el('div', 'empty', 'Run raw HTML comparison when needed.'));
  panel.appendChild(rawDiffCard);

  panel.appendChild(card('Directives', [
    ['Meta robots', formatDirectiveList(analysis.directives.meta)],
    ['X-Robots-Tag', formatDirectiveList(analysis.directives.header)],
    ['Conflict', analysis.directives.conflict ? 'Yes — noindex wins' : 'No'],
  ]));

  renderRobotsCard(panel);

  const canonical = analysis.canonical;
  const diagnostics = canonical.diagnostics || {};
  const canonicalCard = el('div', 'card');
  canonicalCard.appendChild(el('div', 'card-header', 'Canonical'));
  addRow(canonicalCard, 'URL', canonical.url || '—', 'code');
  addRow(canonicalCard, 'Relation', canonical.different ? 'Points to another URL' : (canonical.url ? 'Self-referencing' : 'Missing'));
  addRow(canonicalCard, 'Cross-domain', diagnostics.crossDomain ? 'Yes' : 'No');
  addRow(canonicalCard, 'Protocol mismatch', diagnostics.protocolMismatch ? 'Yes' : 'No');
  addRow(canonicalCard, 'Hostname mismatch', diagnostics.hostnameMismatch ? 'Yes' : 'No');
  addRow(canonicalCard, 'Trailing slash mismatch', diagnostics.trailingSlashMismatch ? 'Yes' : 'No');
  addRow(canonicalCard, 'Query mismatch', diagnostics.queryMismatch ? 'Yes' : 'No');

  if (canonical.url) {
    const actionsCanonical = el('div', 'toolbar');
    const button = el('button', '', 'Check canonical target');
    button.type = 'button';
    button.addEventListener('click', () => {
      (async () => {
        button.disabled = true;
        button.textContent = 'Checking…';
        try {
          const result = await browser.runtime.sendMessage({ type: 'seoInspector.checkTarget', url: canonical.url });
          setCanonicalCheck(canonical.url, result);
          renderIndexability();
        } finally {
          button.disabled = false;
          button.textContent = 'Check canonical target';
        }
      })().catch((error) => handleAsyncUiFailure('canonical-target-check', error));
    });
    actionsCanonical.appendChild(button);
    canonicalCard.appendChild(actionsCanonical);

    const checked = currentCanonicalCheck(canonical.url);
    if (checked) {
      addRow(canonicalCard, 'Target status', checked.error ? checked.error : `${checked.status} ${checked.statusText || ''}`.trim());
      addRow(canonicalCard, 'Redirected', checked.redirected ? 'Yes' : 'No');
      addRow(canonicalCard, 'Final URL', checked.finalUrl || checked.url || '—', 'code');
    }
  }
  panel.appendChild(canonicalCard);

  const redirectCard = el('div', 'card');
  redirectCard.appendChild(el('div', 'card-header', 'Navigation redirects'));
  if (!analysis.redirects.length) {
    redirectCard.appendChild(el('div', 'empty', 'No redirect hops captured for the current navigation.'));
  } else {
    addRow(redirectCard, 'Hop count', analysis.redirectDiagnostics.hopCount);
    addRow(redirectCard, 'Loop', analysis.redirectDiagnostics.loop ? 'Detected' : 'No');
    addRow(redirectCard, 'Excessive', analysis.redirectDiagnostics.excessive ? 'Yes (>5 hops)' : 'No');
    analysis.redirects.forEach((hop, index) => {
      addRow(redirectCard, `#${index + 1} HTTP ${hop.statusCode || '—'}`, `${hop.from || '—'} → ${hop.to || '—'}`, 'code');
    });
    addRow(redirectCard, 'Final URL', analysis.pageUrl || analysis.responseUrl || '—', 'code');
  }
  panel.appendChild(redirectCard);

  renderSitemapCard(panel, analysis);
}
