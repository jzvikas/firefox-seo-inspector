'use strict';

function categoryAuditForReport(report) {
  if (!report || !report.facts) return null;
  return report.categoryAudit || CategoryPageAudit.inspect(report.facts, report.pageType || null);
}

function renderCategoryIssues(panel, audit) {
  const cardNode = el('div', 'card');
  cardNode.appendChild(el('div', 'card-header', 'Category/listing issues'));
  const issues = Array.isArray(audit.issues) ? audit.issues : [];
  if (!issues.length) {
    cardNode.appendChild(el('div', 'empty', 'No category/listing warnings found.'));
  } else {
    issues.forEach((item) => {
      const node = el('div', `issue ${item.severity || 'warning'}`);
      const top = el('div', 'toolbar');
      top.appendChild(badge(String(item.severity || 'warning').toUpperCase(), item.severity || 'warning'));
      top.appendChild(el('strong', '', item.title || item.id || 'Category issue'));
      node.appendChild(top);
      node.appendChild(el('div', 'issue-message', item.message || ''));
      if (Array.isArray(item.refs) && item.refs.length) {
        const actions = el('div', 'issue-actions');
        const button = el('button', '', `Highlight ${item.refs.length} link${item.refs.length === 1 ? '' : 's'}`);
        button.type = 'button';
        button.addEventListener('click', () => sendToTab({ type: 'seoInspector.highlight', refs: item.refs }).catch(() => {}));
        actions.appendChild(button);
        node.appendChild(actions);
      }
      cardNode.appendChild(node);
    });
  }
  panel.appendChild(cardNode);
}

function renderCategoryParamTable(panel, audit) {
  const params = Array.isArray(audit.facets && audit.facets.currentParams) ? audit.facets.currentParams : [];
  if (!params.length) return;
  const cardNode = el('div', 'card');
  cardNode.appendChild(el('div', 'card-header', 'Current URL parameters'));
  const wrap = el('div', 'table-wrap');
  const table = document.createElement('table');
  const head = document.createElement('thead');
  const header = document.createElement('tr');
  ['Parameter', 'Class', 'Value'].forEach((value) => header.appendChild(el('th', '', value)));
  head.appendChild(header);
  table.appendChild(head);
  const body = document.createElement('tbody');
  params.forEach((item) => {
    const row = document.createElement('tr');
    row.appendChild(el('td', 'code', item.name));
    row.appendChild(el('td', '', item.kind));
    row.appendChild(el('td', 'code', item.value));
    body.appendChild(row);
  });
  table.appendChild(body);
  wrap.appendChild(table);
  cardNode.appendChild(wrap);
  panel.appendChild(cardNode);
}

function renderCategory() {
  const panel = document.getElementById('category');
  if (!panel) return;
  clear(panel);
  if (!state.report) {
    panel.appendChild(el('div', 'empty', 'No audit data.'));
    return;
  }

  const audit = categoryAuditForReport(state.report);
  if (!audit || !audit.applicable) {
    const type = state.report.pageType ? PageType.display(state.report.pageType) : 'Unknown';
    panel.appendChild(el('div', 'empty', `Category/listing checks are not applicable to this page. Detected page type: ${type}.`));
    return;
  }

  const summary = el('div', 'card');
  summary.appendChild(el('div', 'card-header', 'Category/listing audit'));
  const toolbar = el('div', 'toolbar');
  toolbar.appendChild(badge(`${audit.summary.critical} critical`, audit.summary.critical ? 'critical' : 'ok'));
  toolbar.appendChild(badge(`${audit.summary.warning} warnings`, audit.summary.warning ? 'warning' : 'ok'));
  toolbar.appendChild(badge(`${audit.listing.itemCount} listing items`, audit.listing.itemCount ? 'ok' : 'warning'));
  summary.appendChild(toolbar);
  addRow(summary, 'Visible words', audit.listing.wordCount || 0);
  addRow(summary, 'ItemList JSON-LD', audit.listing.itemListSchemaCount || 0);
  addRow(summary, 'ItemList microdata', audit.listing.itemListMicrodataCount || 0);
  addRow(summary, 'Product microdata', audit.listing.productMicrodataCount || 0);
  panel.appendChild(summary);

  const canonical = el('div', 'card');
  canonical.appendChild(el('div', 'card-header', 'Canonical'));
  addRow(canonical, 'Current URL', audit.canonical.currentUrl || '—', 'code');
  addRow(canonical, 'Canonical', audit.canonical.canonical || '—', 'code');
  addRow(canonical, 'Canonical state', audit.canonical.self ? 'Self canonical' : 'Different / missing');
  addRow(canonical, 'Clean base URL', audit.canonical.cleanBase || '—', 'code');
  panel.appendChild(canonical);

  const facets = el('div', 'card');
  facets.appendChild(el('div', 'card-header', 'Faceted navigation'));
  addRow(facets, 'Detected', audit.facets.detected ? 'Yes' : 'No');
  addRow(facets, 'Filter parameters', audit.facets.filterParams.map((item) => item.name).join(', ') || 'None');
  addRow(facets, 'Sort parameters', audit.facets.sortParams.map((item) => item.name).join(', ') || 'None');
  addRow(facets, 'Tracking/session parameters', audit.facets.trackingParams.concat(audit.facets.sessionParams).map((item) => item.name).join(', ') || 'None');
  addRow(facets, 'Parameterized internal links', audit.facets.internalParameterizedLinkCount || 0);
  panel.appendChild(facets);

  const pagination = el('div', 'card');
  pagination.appendChild(el('div', 'card-header', 'Pagination'));
  addRow(pagination, 'Detected', audit.pagination.detected ? 'Yes' : 'No');
  addRow(pagination, 'Current page', audit.pagination.pageNumber || 1);
  addRow(pagination, 'rel=prev', audit.pagination.relPrev || '—', 'code');
  addRow(pagination, 'rel=next', audit.pagination.relNext || '—', 'code');
  addRow(pagination, 'Pagination links', audit.pagination.internalLinkCount || 0);
  panel.appendChild(pagination);

  renderCategoryParamTable(panel, audit);
  renderCategoryIssues(panel, audit);
}
