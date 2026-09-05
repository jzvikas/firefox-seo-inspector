'use strict';

function productAuditForReport(report) {
  if (!report || !report.facts) return null;
  return report.productAudit || ProductPageAudit.inspect(report.facts, report.pageType || null);
}

function productFieldStatus(fieldValue) {
  if (!fieldValue) return '—';
  return fieldValue.present ? 'Present' : 'Missing';
}

function renderProductFieldTable(panel, audit) {
  const cardNode = el('div', 'card');
  cardNode.appendChild(el('div', 'card-header', 'Product structured-data fields'));
  const wrap = el('div', 'table-wrap');
  const table = document.createElement('table');
  const head = document.createElement('thead');
  const header = document.createElement('tr');
  ['Field', 'Status', 'Value', 'Guidance'].forEach((value) => header.appendChild(el('th', '', value)));
  head.appendChild(header);
  table.appendChild(head);
  const body = document.createElement('tbody');
  Object.values(audit.fields || {}).forEach((item) => {
    const row = document.createElement('tr');
    row.appendChild(el('td', '', item.label || 'Field'));
    const status = document.createElement('td');
    status.appendChild(badge(productFieldStatus(item), item.present ? 'ok' : (item.recommended ? 'warning' : '')));
    row.appendChild(status);
    row.appendChild(el('td', 'code', item.value || '—'));
    row.appendChild(el('td', 'muted', item.recommended ? 'Recommended product signal' : 'Useful when applicable'));
    body.appendChild(row);
  });
  table.appendChild(body);
  wrap.appendChild(table);
  cardNode.appendChild(wrap);
  cardNode.appendChild(el('div', 'muted', 'Missing GTIN, SKU, rating, or reviews are not automatically treated as SEO errors because those values are not valid/applicable for every product.'));
  panel.appendChild(cardNode);
}

function renderProductIssues(panel, audit) {
  const cardNode = el('div', 'card');
  cardNode.appendChild(el('div', 'card-header', 'Product issues'));
  const issues = Array.isArray(audit.issues) ? audit.issues : [];
  if (!issues.length) {
    cardNode.appendChild(el('div', 'empty', 'No product-specific critical issues or warnings found.'));
  } else {
    issues.forEach((item) => {
      const node = el('div', `issue ${item.severity || 'warning'}`);
      const top = el('div', 'toolbar');
      top.appendChild(badge(String(item.severity || 'warning').toUpperCase(), item.severity || 'warning'));
      top.appendChild(el('strong', '', item.title || item.id || 'Product issue'));
      node.appendChild(top);
      node.appendChild(el('div', 'issue-message', item.message || ''));
      cardNode.appendChild(node);
    });
  }
  panel.appendChild(cardNode);
}

function renderProductHints(panel, audit) {
  const hints = Array.isArray(audit.hints) ? audit.hints : [];
  if (!hints.length) return;
  const cardNode = el('div', 'card');
  cardNode.appendChild(el('div', 'card-header', 'Product handling hints'));
  const list = document.createElement('ul');
  hints.forEach((hint) => list.appendChild(el('li', '', hint)));
  cardNode.appendChild(list);
  panel.appendChild(cardNode);
}

function renderProduct() {
  const panel = document.getElementById('product');
  if (!panel) return;
  clear(panel);
  if (!state.report) {
    panel.appendChild(el('div', 'empty', 'No audit data.'));
    return;
  }

  const audit = productAuditForReport(state.report);
  if (!audit || !audit.applicable) {
    const type = state.report.pageType ? PageType.display(state.report.pageType) : 'Unknown';
    panel.appendChild(el('div', 'empty', `Product checks are not applicable to this page. Detected page type: ${type}.`));
    return;
  }

  const summary = el('div', 'card');
  summary.appendChild(el('div', 'card-header', 'Product page audit'));
  const toolbar = el('div', 'toolbar');
  toolbar.appendChild(badge(`${audit.summary.completeness}% fields present`, audit.summary.completeness >= 80 ? 'ok' : 'warning'));
  toolbar.appendChild(badge(`${audit.summary.critical} critical`, audit.summary.critical ? 'critical' : 'ok'));
  toolbar.appendChild(badge(`${audit.summary.warning} warnings`, audit.summary.warning ? 'warning' : 'ok'));
  summary.appendChild(toolbar);
  addRow(summary, 'Product JSON-LD nodes', audit.schema.productCount || 0);
  addRow(summary, 'ProductGroup nodes', audit.schema.productGroupCount || 0);
  addRow(summary, 'BreadcrumbList', audit.schema.breadcrumbCount ? `${audit.schema.breadcrumbCount} found` : 'Missing');
  addRow(summary, 'Offer nodes', audit.offers.count || 0);
  panel.appendChild(summary);

  renderProductFieldTable(panel, audit);

  const canonical = el('div', 'card');
  canonical.appendChild(el('div', 'card-header', 'Canonical and variants'));
  addRow(canonical, 'Current URL', audit.canonical.currentUrl || '—');
  addRow(canonical, 'Canonical', audit.canonical.canonical || '—');
  addRow(canonical, 'Canonical state', audit.canonical.self ? 'Self canonical' : (audit.canonical.baseVariant ? 'Variant → base product' : 'Different / missing'));
  addRow(canonical, 'Variant-like parameters', (audit.variants.parameterNames || []).join(', ') || 'None');
  addRow(canonical, 'Structured variant URLs', (audit.variants.productUrls || []).length || 0);
  panel.appendChild(canonical);

  const stock = el('div', 'card');
  stock.appendChild(el('div', 'card-header', 'Availability'));
  addRow(stock, 'Structured availability', (audit.stock.states || []).join(', ') || 'Not provided');
  addRow(stock, 'Out of stock', audit.stock.outOfStock ? 'Yes' : 'No');
  addRow(stock, 'Discontinued', audit.stock.discontinued ? 'Yes' : 'No');
  panel.appendChild(stock);

  renderProductIssues(panel, audit);
  renderProductHints(panel, audit);

  const actions = el('div', 'toolbar');
  const schemaButton = el('button', '', 'Open Schema');
  schemaButton.type = 'button';
  schemaButton.addEventListener('click', () => activateTab('schema'));
  actions.appendChild(schemaButton);
  panel.appendChild(actions);
}
