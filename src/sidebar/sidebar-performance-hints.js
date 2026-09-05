'use strict';

function performanceHintCandidateLabel(candidate) {
  if (!candidate) return 'Not detected';
  if (candidate.url) return candidate.url;
  return candidate.text || candidate.type || 'Candidate';
}

function appendPerformanceHintIssue(container, issue) {
  const node = el('div', `issue ${issue.severity || 'warning'}`);
  const title = el('div', 'issue-title');
  title.appendChild(el('span', '', issue.title || issue.code || 'Performance hint'));
  title.appendChild(badge(issue.severity || 'warning', issue.severity || 'warning'));
  node.appendChild(title);
  node.appendChild(el('div', 'issue-message', issue.message || ''));
  if (Array.isArray(issue.refs) && issue.refs.length) {
    const actions = el('div', 'issue-actions');
    const button = el('button', '', `Highlight ${issue.refs.length}`);
    button.type = 'button';
    button.addEventListener('click', () => sendToTab({ type: 'seoInspector.highlight', refs: issue.refs }).catch(() => {}));
    actions.appendChild(button);
    node.appendChild(actions);
  }
  container.appendChild(node);
}

function appendHintTable(container, headers, rows) {
  const wrap = el('div', 'table-wrap');
  const table = document.createElement('table');
  const head = document.createElement('thead');
  const hrow = document.createElement('tr');
  headers.forEach((value) => hrow.appendChild(el('th', '', value)));
  head.appendChild(hrow);
  table.appendChild(head);
  const body = document.createElement('tbody');
  rows.forEach((values) => {
    const row = document.createElement('tr');
    values.forEach((value, index) => row.appendChild(el('td', index === values.length - 1 ? 'cell-url code' : '', value || '—')));
    body.appendChild(row);
  });
  table.appendChild(body);
  wrap.appendChild(table);
  container.appendChild(wrap);
}

function renderPerformanceHints() {
  const panel = document.getElementById('performance');
  if (!panel || !state.report) return;
  const report = state.report.performanceHints;
  if (!report) {
    panel.appendChild(el('div', 'muted', 'Web performance hints are unavailable. Reload the page after updating the extension.'));
    return;
  }

  const lcp = el('div', 'card');
  lcp.appendChild(el('div', 'card-header', 'Likely LCP candidate · heuristic'));
  const candidate = report.lcpCandidate;
  if (!candidate) {
    lcp.appendChild(el('div', 'empty', 'No visible image/video/large text candidate was detected in the initial viewport.'));
  } else {
    addRow(lcp, 'Type', String(candidate.type || '—').toUpperCase());
    addRow(lcp, 'Visible area', `${candidate.visibleArea || 0} px²`);
    addRow(lcp, 'Rendered size', `${candidate.width || 0}×${candidate.height || 0}`);
    addRow(lcp, candidate.url ? 'Resource' : 'Text', performanceHintCandidateLabel(candidate), candidate.url ? 'code' : '');
    if (candidate.ref) {
      const toolbar = el('div', 'toolbar');
      const button = el('button', '', 'Highlight candidate');
      button.type = 'button';
      button.addEventListener('click', () => sendToTab({ type: 'seoInspector.highlight', refs: [candidate.ref] }).catch(() => {}));
      toolbar.appendChild(button);
      lcp.appendChild(toolbar);
    }
    lcp.appendChild(el('div', 'muted', 'This is a local viewport heuristic, not the browser-reported Core Web Vitals LCP value.'));
  }
  panel.appendChild(lcp);

  const summary = report.summary || {};
  const summaryCard = el('div', 'card');
  summaryCard.appendChild(el('div', 'card-header', 'Web performance hints'));
  addRow(summaryCard, 'Potential CLS elements', summary.clsRiskCount || 0);
  addRow(summaryCard, 'Images missing dimensions', summary.missingImageDimensions || 0);
  addRow(summaryCard, 'Above-fold lazy images', summary.aboveFoldLazyImages || 0);
  addRow(summaryCard, 'Below-fold eager images', summary.belowFoldEagerImages || 0);
  addRow(summaryCard, 'Resource hints', summary.resourceHintCount || 0);
  addRow(summaryCard, 'Render-blocking candidates', summary.renderBlockingCount || 0);
  addRow(summaryCard, 'Observed fonts', summary.fontCount || 0);
  addRow(summaryCard, 'Font preloads', summary.fontPreloadCount || 0);
  panel.appendChild(summaryCard);

  const issues = el('div', 'card');
  issues.appendChild(el('div', 'card-header', `Actionable hints · ${(report.issues || []).length}`));
  if (!Array.isArray(report.issues) || !report.issues.length) {
    issues.appendChild(el('div', 'empty', 'No configured web-performance hints were triggered.'));
  } else {
    report.issues.forEach((issue) => appendPerformanceHintIssue(issues, issue));
  }
  panel.appendChild(issues);

  const resourceHints = el('div', 'card');
  resourceHints.appendChild(el('div', 'card-header', 'Preload / connection / prefetch hints'));
  const hintRows = (report.resourceHints || []).map((item) => [
    item.rel,
    item.as || '—',
    item.crossorigin || '—',
    item.href || '—',
  ]);
  if (!hintRows.length) resourceHints.appendChild(el('div', 'empty', 'No preload, modulepreload, preconnect, prefetch, or DNS-prefetch links found.'));
  else appendHintTable(resourceHints, ['Rel', 'As', 'Crossorigin', 'URL'], hintRows.slice(0, 100));
  panel.appendChild(resourceHints);

  const blocking = el('div', 'card');
  blocking.appendChild(el('div', 'card-header', 'Render-blocking candidates'));
  const blockingRows = (report.renderBlocking || []).map((item) => [item.type, item.reason, item.url]);
  if (!blockingRows.length) blocking.appendChild(el('div', 'empty', 'No head stylesheet or synchronous external-script candidates detected.'));
  else appendHintTable(blocking, ['Type', 'Reason', 'URL'], blockingRows.slice(0, 100));
  blocking.appendChild(el('div', 'muted', 'Candidates are conservative markup hints; actual browser scheduling can differ.'));
  panel.appendChild(blocking);

  const fonts = report.fonts || { fonts: [], preloads: [], missingPreload: [], preloadWithoutCrossorigin: [] };
  const fontCard = el('div', 'card');
  fontCard.appendChild(el('div', 'card-header', 'Font loading hints'));
  addRow(fontCard, 'Observed font resources', (fonts.fonts || []).length);
  addRow(fontCard, 'Font preloads', (fonts.preloads || []).length);
  addRow(fontCard, 'Observed fonts without matching preload', (fonts.missingPreload || []).length);
  addRow(fontCard, 'Font preloads without crossorigin', (fonts.preloadWithoutCrossorigin || []).length);
  const fontRows = (fonts.fonts || []).map((item) => [
    item.preloaded ? 'Preloaded' : 'Not preloaded',
    typeof performanceMs === 'function' ? performanceMs(item.duration) : `${item.duration || 0} ms`,
    typeof performanceBytes === 'function' && item.sizeBytes ? performanceBytes(item.sizeBytes) : item.sizeBytes ? `${item.sizeBytes} B` : 'Unknown',
    item.url || '—',
  ]);
  if (fontRows.length) appendHintTable(fontCard, ['Preload', 'Duration', 'Size', 'URL'], fontRows.slice(0, 100));
  else fontCard.appendChild(el('div', 'empty', 'No font Resource Timing entries were observed.'));
  panel.appendChild(fontCard);
}
