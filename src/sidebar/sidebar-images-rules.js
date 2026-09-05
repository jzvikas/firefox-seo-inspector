'use strict';

function syncCustomImageSizeIssue(analysis, config) {
  if (!state.report || !state.report.evaluation) return null;
  const evaluation = state.report.evaluation;
  const current = Array.isArray(evaluation.issues) ? evaluation.issues : [];
  const withoutImageSize = current.filter((item) => item.id !== 'images.fileSize');
  const issue = CustomRules.imageSizeIssue(analysis, config);
  const next = issue ? withoutImageSize.concat(issue) : withoutImageSize;
  if (JSON.stringify(current) !== JSON.stringify(next)) {
    evaluation.issues = next;
    evaluation.score = CustomRules.scoreIssues(next);
    evaluation.severityCounts = CustomRules.severityCounts(next);
    renderHeader();
    renderIssues();
  }
  return issue;
}

const renderImagesNetworkWithoutRules = renderImagesNetwork;
renderImagesNetwork = function renderImagesNetworkWithRules() {
  renderImagesNetworkWithoutRules();
  const panel = document.getElementById('images');
  if (!panel || !state.report) return;

  const facts = state.report.facts || {};
  const images = Array.isArray(facts.images) ? facts.images : [];
  if (!images.length) return;
  const dpr = Math.max(1, Number(state.report.pageContext && state.report.pageContext.devicePixelRatio) || 1);
  const networkResults = imageNetworkState.response && Array.isArray(imageNetworkState.response.results)
    ? imageNetworkState.response.results
    : [];
  const analysis = ImageAudit.analyze(images, networkResults, dpr);
  const config = state.report.customRules
    ? CustomRules.normalize(state.report.customRules)
    : CustomRules.normalize(null);
  const limit = config.thresholds.imageMaxBytes;
  const issue = syncCustomImageSizeIssue(analysis, config);
  const known = analysis.rows.filter((row) => Number(row.sizeBytes) > 0).length;
  const exceeded = analysis.rows.filter((row) => Number(row.sizeBytes) > limit).length;

  const node = el('div', 'card');
  node.appendChild(el('div', 'card-header', 'Custom image file-size rule'));
  addRow(node, 'Limit', ImageAudit.bytesLabel(limit));
  addRow(node, 'Known sizes', known);
  addRow(node, 'Above limit', exceeded);
  if (!CustomRules.isEnabled(config, 'images.fileSize')) {
    node.appendChild(el('div', 'muted', 'This check is disabled in Rules.'));
  } else if (issue) {
    const issueNodeElement = el('div', `issue ${issue.severity}`);
    const title = el('div', 'issue-title');
    title.appendChild(el('span', '', issue.title));
    title.appendChild(badge(issue.severity, issue.severity));
    issueNodeElement.appendChild(title);
    issueNodeElement.appendChild(el('div', 'issue-message', issue.message));
    if (issue.refs.length) {
      const button = el('button', '', `Highlight ${issue.refs.length}`);
      button.type = 'button';
      button.addEventListener('click', () => sendToTab({ type: 'seoInspector.highlight', refs: issue.refs }).catch(() => {}));
      issueNodeElement.appendChild(button);
    }
    node.appendChild(issueNodeElement);
  } else if (!known) {
    node.appendChild(el('div', 'muted', 'No image byte sizes are known yet. Run Check image network to measure them.'));
  } else {
    node.appendChild(el('div', 'empty', 'No known image exceeds the configured limit.'));
  }
  panel.appendChild(node);
};
