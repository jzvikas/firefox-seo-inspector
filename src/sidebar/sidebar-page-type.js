'use strict';

function pageTypeEvidenceText(item) {
  if (!item) return '';
  const detail = String(item.detail || '').trim();
  return detail || String(item.signal || '').trim();
}

function pageTypeCard(report) {
  const result = report && report.pageType;
  const node = el('div', 'card');
  node.appendChild(el('div', 'card-header', 'Page type detection'));
  if (!result) {
    node.appendChild(el('div', 'empty', 'Page type was not classified for this report.'));
    return node;
  }

  addRow(node, 'Type', PageType.display(result));
  addRow(node, 'Confidence', result.confidence || 'low');
  const traits = [];
  if (result.traits && result.traits.faceted) traits.push('Faceted / filtered');
  if (result.traits && result.traits.pagination) traits.push('Pagination');
  addRow(node, 'Traits', traits.join(', ') || 'None');

  const evidence = Array.isArray(result.evidence) ? result.evidence : [];
  if (evidence.length) {
    const evidenceNode = el('div', 'page-type-evidence');
    evidenceNode.appendChild(el('div', 'muted', 'Evidence'));
    evidence.slice(0, 8).forEach((item) => {
      const row = el('div', 'row');
      row.appendChild(el('div', 'row-label', PageType.LABELS[item.type] || item.type || 'Signal'));
      row.appendChild(el('div', 'row-value', pageTypeEvidenceText(item)));
      evidenceNode.appendChild(row);
    });
    node.appendChild(evidenceNode);
  }
  node.appendChild(el('div', 'muted', 'Local heuristic classification. Confidence reflects available technical signals, not a search-engine page-type label.'));
  return node;
}

const renderOverviewWithoutPageType = renderOverview;
renderOverview = function renderOverviewWithPageType() {
  renderOverviewWithoutPageType();
  const panel = document.getElementById('overview');
  if (!panel || !state.report) return;
  const typeCard = pageTypeCard(state.report);
  if (panel.children && panel.children.length > 1) panel.insertBefore(typeCard, panel.children[1]);
  else panel.appendChild(typeCard);
};
