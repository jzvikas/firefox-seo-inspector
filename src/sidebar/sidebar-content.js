'use strict';

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
  const rawButton = el('button', '', state.rawReport ? 'Refresh raw HTML' : 'Compare raw HTML');
  rawButton.type = 'button';
  rawButton.addEventListener('click', async () => {
    rawButton.disabled = true;
    rawButton.textContent = 'Fetching…';
    try {
      state.rawReport = await sendToTab({ type: 'seoInspector.fetchRaw' });
      state.rawDiff = SeoCore.diffPageFacts(state.report.facts, state.rawReport.facts);
    } catch (_error) {
      state.rawReport = null;
      state.rawDiff = null;
    }
    renderContent();
  });
  rawToolbar.appendChild(rawButton);
  raw.appendChild(rawToolbar);
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
  } else {
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
