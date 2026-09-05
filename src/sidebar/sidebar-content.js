'use strict';

const rawSourceUiState = {
  loading: false,
  operationId: '',
  error: '',
};

function rawSourceOperationId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return `raw-${crypto.randomUUID()}`;
  return `raw-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function rawSourceErrorMessage(result) {
  const reason = result && result.error ? String(result.error) : '';
  if (!reason) return '';
  if (reason === 'timeout') return 'Raw HTML fetch exceeded the 12-second timeout.';
  if (reason === 'too-large') return 'Raw HTML exceeded the 2 MiB safety limit.';
  if (reason === 'not-html') return 'Raw source response is not HTML/XHTML.';
  if (reason === 'cancelled') return 'Raw HTML fetch was cancelled.';
  if (reason === 'invalid-url') return 'Raw HTML fetch requires an HTTP or HTTPS page.';
  return `Raw HTML fetch failed (${reason}).`;
}

function rawSourceRenderConsumers() {
  try { renderContent(); } catch (_error) {}
  try { renderCompare(); } catch (_error) {}
}

async function runRawSourceFetch() {
  if (rawSourceUiState.loading || !state.report) return null;
  const operationId = rawSourceOperationId();
  rawSourceUiState.loading = true;
  rawSourceUiState.operationId = operationId;
  rawSourceUiState.error = '';
  rawSourceRenderConsumers();
  try {
    const result = await sendToTab({ type: 'seoInspector.fetchRaw', operationId });
    if (rawSourceUiState.operationId !== operationId) return null;
    const error = rawSourceErrorMessage(result);
    if (error) {
      state.rawReport = null;
      state.rawDiff = null;
      rawSourceUiState.error = error;
      return result;
    }
    if (!result || !result.facts) {
      state.rawReport = null;
      state.rawDiff = null;
      rawSourceUiState.error = 'Raw HTML fetch returned no usable audit data.';
      return result || null;
    }
    state.rawReport = result;
    state.rawDiff = SeoCore.diffPageFacts(state.report.facts, result.facts);
    return result;
  } catch (_error) {
    if (rawSourceUiState.operationId === operationId) {
      state.rawReport = null;
      state.rawDiff = null;
      rawSourceUiState.error = 'Raw HTML fetch failed because the inspected tab became unavailable.';
    }
    return null;
  } finally {
    if (rawSourceUiState.operationId === operationId) {
      rawSourceUiState.loading = false;
      rawSourceUiState.operationId = '';
      rawSourceRenderConsumers();
    }
  }
}

async function cancelRawSourceFetch() {
  const operationId = rawSourceUiState.operationId;
  if (!rawSourceUiState.loading || !operationId) return;
  try {
    await sendToTab({ type: 'seoInspector.cancelRaw', operationId });
  } catch (_error) {
    rawSourceUiState.error = 'Raw HTML cancellation could not reach the inspected tab.';
    rawSourceUiState.loading = false;
    rawSourceUiState.operationId = '';
    rawSourceRenderConsumers();
  }
}

function appendRawSourceStatus(container) {
  if (rawSourceUiState.error) {
    const issue = el('div', rawSourceUiState.error.includes('cancelled') ? 'issue info' : 'issue warning');
    issue.appendChild(el('div', 'issue-message', rawSourceUiState.error));
    container.appendChild(issue);
  }
  container.appendChild(el('div', 'muted', 'Authenticated same-page raw source · max 2 MiB · 12-second timeout · cancellable · kept local.'));
}

function contentIssueList(container, issues) {
  const items = Array.isArray(issues) ? issues : [];
  if (!items.length) {
    container.appendChild(el('div', 'empty', 'No issues found in this section.'));
    return;
  }
  items.forEach((item) => {
    const node = el('div', `issue ${item.severity || 'warning'}`);
    const title = el('div', 'issue-title');
    title.appendChild(el('span', '', item.code || 'Content signal'));
    title.appendChild(badge(item.severity || 'warning', item.severity || 'warning'));
    node.appendChild(title);
    node.appendChild(el('div', 'issue-message', item.message || 'Review this content signal.'));
    container.appendChild(node);
  });
}

function renderContent() {
  const panel = document.getElementById('content');
  clear(panel);
  if (!state.report) return panel.appendChild(el('div', 'empty', 'No audit data.'));

  const audit = state.report.contentAudit;
  if (!audit) {
    panel.appendChild(el('div', 'empty', 'Content inspection data is unavailable. Reload the page after updating the extension.'));
    return;
  }

  const text = audit.text || {};
  const summary = el('div', 'card');
  summary.appendChild(el('div', 'card-header', 'Content overview'));
  addRow(summary, 'Visible words', text.visibleWords || 0);
  addRow(summary, 'DOM text words', text.allWords || 0);
  addRow(summary, 'Hidden text words', text.hiddenWords || 0);
  addRow(summary, 'Hidden content roots', text.hiddenRootCount || 0);
  addRow(summary, 'DOM nodes inspected', `${text.visitedNodes || 0}${text.truncated ? ` / ${text.nodeLimit} cap reached` : ''}`);
  addRow(summary, 'Thin-content heuristic', audit.thinContent && audit.thinContent.thin ? `Review · under ${audit.thinContent.threshold} visible words` : `OK · ${audit.thinContent ? audit.thinContent.threshold : 150}-word threshold`);
  panel.appendChild(summary);

  if (audit.thinContent && audit.thinContent.thin) {
    const warning = el('div', 'issue warning');
    const title = el('div', 'issue-title');
    title.appendChild(el('span', '', 'Low visible word count'));
    title.appendChild(badge('heuristic', 'warning'));
    warning.appendChild(title);
    warning.appendChild(el('div', 'issue-message', `${audit.thinContent.message} This is a generic page-level heuristic, not a search-engine rule.`));
    panel.appendChild(warning);
  }

  const raw = el('div', 'card');
  raw.appendChild(el('div', 'card-header', 'Raw HTML vs rendered text'));
  const rawToolbar = el('div', 'toolbar');
  const rawButton = el('button', '', rawSourceUiState.loading ? 'Cancel raw HTML' : state.rawReport ? 'Refresh raw HTML' : 'Compare raw HTML');
  rawButton.type = 'button';
  rawButton.addEventListener('click', () => {
    if (rawSourceUiState.loading) cancelRawSourceFetch().catch(() => {});
    else runRawSourceFetch().catch(() => {});
  });
  rawToolbar.appendChild(rawButton);
  raw.appendChild(rawToolbar);
  appendRawSourceStatus(raw);
  if (state.rawReport && state.rawReport.contentAudit) {
    const rawText = state.rawReport.contentAudit.text || {};
    const rawWords = Number(rawText.allWords) || 0;
    const renderedWords = Number(text.allWords) || 0;
    const visibleWords = Number(text.visibleWords) || 0;
    addRow(raw, 'Raw HTML words', rawWords);
    addRow(raw, 'Rendered DOM words', renderedWords);
    addRow(raw, 'Rendered visible words', visibleWords);
    addRow(raw, 'Raw → rendered DOM delta', renderedWords - rawWords);
    addRow(raw, 'Rendered DOM → visible delta', visibleWords - renderedWords);
    if (Number(state.rawReport.sizeBytes) > 0) addRow(raw, 'Raw source bytes read', state.rawReport.sizeBytes);
  } else if (!rawSourceUiState.loading && !rawSourceUiState.error) {
    raw.appendChild(el('div', 'muted', 'Run this only when needed. It re-fetches the current page source using the current page session so authenticated source can be compared locally.'));
  }
  panel.appendChild(raw);

  const hidden = el('div', 'card');
  hidden.appendChild(el('div', 'card-header', 'Hidden-content signals'));
  const reasons = text.hiddenReasons || {};
  const reasonKeys = Object.keys(reasons).sort();
  if (!reasonKeys.length) {
    hidden.appendChild(el('div', 'empty', 'No hidden-content roots matched the configured technical heuristics.'));
  } else {
    reasonKeys.forEach((reason) => addRow(hidden, reason, reasons[reason]));
    const samples = Array.isArray(text.hiddenSamples) ? text.hiddenSamples : [];
    if (samples.length) {
      const sampleWrap = el('div', 'table-wrap');
      const table = document.createElement('table');
      const head = document.createElement('thead');
      const hrow = document.createElement('tr');
      ['Element', 'Reason'].forEach((value) => hrow.appendChild(el('th', '', value)));
      head.appendChild(hrow);
      table.appendChild(head);
      const body = document.createElement('tbody');
      samples.forEach((item) => {
        const row = document.createElement('tr');
        row.appendChild(el('td', 'code', item.element || 'element'));
        row.appendChild(el('td', '', item.reason || 'hidden'));
        body.appendChild(row);
      });
      table.appendChild(body);
      sampleWrap.appendChild(table);
      hidden.appendChild(sampleWrap);
    }
  }
  hidden.appendChild(el('div', 'muted', 'These are technical visibility signals only. The inspector does not label hidden content as spam or infer search-engine intent.'));
  panel.appendChild(hidden);

  const language = audit.language || {};
  const languageCard = el('div', 'card');
  languageCard.appendChild(el('div', 'card-header', 'Language consistency'));
  addRow(languageCard, 'HTML lang', language.htmlLang || 'Missing');
  addRow(languageCard, 'Content-Language', language.headerLang || 'Not declared');
  addRow(languageCard, 'Self hreflang', Array.isArray(language.selfHreflang) && language.selfHreflang.length ? language.selfHreflang.join(', ') : 'None');
  contentIssueList(languageCard, language.issues || []);
  panel.appendChild(languageCard);

  const headings = audit.headings || {};
  const headingCard = el('div', 'card');
  headingCard.appendChild(el('div', 'card-header', 'Heading quality'));
  addRow(headingCard, 'Total headings', headings.total || 0);
  const counts = headings.counts || {};
  addRow(headingCard, 'By level', [1, 2, 3, 4, 5, 6].map((level) => `H${level}: ${counts[level] || 0}`).join(' · '));
  addRow(headingCard, 'Empty headings', headings.empty || 0);
  addRow(headingCard, 'Skipped-level transitions', Array.isArray(headings.jumps) ? headings.jumps.length : 0);
  contentIssueList(headingCard, headings.issues || []);
  panel.appendChild(headingCard);

  if (text.truncated) panel.appendChild(el('div', 'muted', `Content scan stopped at the ${text.nodeLimit}-node safety cap to keep the sidebar responsive.`));
}
