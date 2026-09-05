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

function renderIndexability() {
  const panel = document.getElementById('indexability');
  clear(panel);
  if (!state.report) return panel.appendChild(el('div', 'empty', 'No audit data.'));

  const analysis = state.report.evaluation.indexability
    || Indexability.analyze(state.report.facts, state.report.responseMeta || null);
  const verdictCard = el('div', 'card');
  const header = el('div', 'card-header', 'Indexability verdict');
  header.appendChild(document.createTextNode(' '));
  header.appendChild(badge(analysis.verdict, verdictKind(analysis.verdict)));
  verdictCard.appendChild(header);
  analysis.reasons.forEach((item) => {
    addRow(verdictCard, item.label, item.detail || 'Detected');
  });
  panel.appendChild(verdictCard);

  panel.appendChild(card('Directives', [
    ['Meta robots', formatDirectiveList(analysis.directives.meta)],
    ['X-Robots-Tag', formatDirectiveList(analysis.directives.header)],
    ['Conflict', analysis.directives.conflict ? 'Yes — noindex wins' : 'No'],
  ]));

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
    const actions = el('div', 'toolbar');
    const button = el('button', '', 'Check canonical target');
    button.type = 'button';
    button.addEventListener('click', async () => {
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
    });
    actions.appendChild(button);
    canonicalCard.appendChild(actions);

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
}
