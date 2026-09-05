'use strict';

function securityStateClass(row) {
  if (!row) return 'warning';
  if (row.state === 'present' || row.state === 'covered') return 'ok';
  if (row.state === 'not-applicable') return 'info';
  if (row.severity === 'info') return 'info';
  return 'warning';
}

function renderSecurity() {
  const panel = document.getElementById('security');
  clear(panel);
  if (!state.report) return panel.appendChild(el('div', 'empty', 'No audit data.'));

  const audit = state.report.securityAudit;
  if (!audit) {
    panel.appendChild(el('div', 'empty', 'Security inspection data is unavailable. Reload the page after updating the extension.'));
    return;
  }

  const transport = el('div', 'card');
  transport.appendChild(el('div', 'card-header', 'Transport security'));
  addRow(transport, 'Page protocol', audit.transport && audit.transport.protocol ? audit.transport.protocol : 'Unknown');
  addRow(transport, 'HTTPS', audit.transport && audit.transport.https ? 'Yes' : 'No');
  addRow(transport, 'Mixed HTTP resources', audit.mixed ? audit.mixed.total : 0);
  addRow(transport, 'Active mixed content', audit.mixed ? audit.mixed.active : 0);
  addRow(transport, 'Passive mixed content', audit.mixed ? audit.mixed.passive : 0);
  panel.appendChild(transport);

  const issues = Array.isArray(audit.issues) ? audit.issues : [];
  const issueCard = el('div', 'card');
  issueCard.appendChild(el('div', 'card-header', `Security findings · ${issues.length}`));
  if (!issues.length) issueCard.appendChild(el('div', 'empty', 'No configured security warnings were found.'));
  else issues.forEach((item) => {
    const node = el('div', `issue ${item.severity || 'warning'}`);
    const title = el('div', 'issue-title');
    title.appendChild(el('span', '', item.code || 'security'));
    title.appendChild(badge(item.severity || 'warning', item.severity || 'warning'));
    node.appendChild(title);
    node.appendChild(el('div', 'issue-message', item.message || 'Review this security signal.'));
    issueCard.appendChild(node);
  });
  panel.appendChild(issueCard);

  const headers = el('div', 'card');
  headers.appendChild(el('div', 'card-header', 'Response security headers'));
  const headerRows = Array.isArray(audit.headers) ? audit.headers : [];
  if (!headerRows.length) headers.appendChild(el('div', 'empty', 'No security header metadata was captured. Reload the page after reloading the extension.'));
  else {
    const wrap = el('div', 'table-wrap');
    const table = document.createElement('table');
    const head = document.createElement('thead');
    const hrow = document.createElement('tr');
    ['Header', 'State', 'Value / explanation'].forEach((value) => hrow.appendChild(el('th', '', value)));
    head.appendChild(hrow);
    table.appendChild(head);
    const body = document.createElement('tbody');
    headerRows.forEach((item) => {
      const row = document.createElement('tr');
      row.appendChild(el('td', '', item.label || item.key || 'Header'));
      const stateCell = document.createElement('td');
      stateCell.appendChild(badge(item.state || 'unknown', securityStateClass(item)));
      row.appendChild(stateCell);
      const detail = item.value ? `${item.value}${item.detail ? ` · ${item.detail}` : ''}` : (item.detail || '—');
      const valueCell = el('td', item.value ? 'code' : '', detail);
      valueCell.title = detail;
      row.appendChild(valueCell);
      body.appendChild(row);
    });
    table.appendChild(body);
    wrap.appendChild(table);
    headers.appendChild(wrap);
  }
  if (audit.reportOnlyCsp) addRow(headers, 'CSP Report-Only', audit.reportOnlyCsp);
  panel.appendChild(headers);

  const mixed = el('div', 'card');
  mixed.appendChild(el('div', 'card-header', 'Mixed-content references'));
  const mixedItems = audit.mixed && Array.isArray(audit.mixed.items) ? audit.mixed.items : [];
  if (!audit.transport || !audit.transport.https) {
    mixed.appendChild(el('div', 'muted', 'Mixed-content classification applies to HTTPS pages. This page is already using a non-HTTPS transport.'));
  } else if (!mixedItems.length) {
    mixed.appendChild(el('div', 'empty', 'No HTTP subresource references were found in the configured DOM/Resource Timing checks.'));
  } else {
    const wrap = el('div', 'table-wrap');
    const table = document.createElement('table');
    const head = document.createElement('thead');
    const hrow = document.createElement('tr');
    ['Risk', 'Type', 'Source', 'URL'].forEach((value) => hrow.appendChild(el('th', '', value)));
    head.appendChild(hrow);
    table.appendChild(head);
    const body = document.createElement('tbody');
    mixedItems.forEach((item) => {
      const row = document.createElement('tr');
      row.appendChild(el('td', '', item.active ? 'Active/blockable' : 'Passive'));
      row.appendChild(el('td', '', item.kind || 'other'));
      row.appendChild(el('td', '', item.source || 'DOM'));
      const url = el('td', 'cell-url code', item.url || '—');
      url.title = item.url || '';
      row.appendChild(url);
      body.appendChild(row);
    });
    table.appendChild(body);
    wrap.appendChild(table);
    mixed.appendChild(wrap);
    if (audit.mixed.capped) mixed.appendChild(el('div', 'muted', `Showing first ${SecurityAudit.MIXED_SAMPLE_LIMIT} mixed-content references.`));
  }
  panel.appendChild(mixed);

  const scripts = audit.thirdPartyScripts || { count: 0, hosts: [], sample: [] };
  const thirdParty = el('div', 'card');
  thirdParty.appendChild(el('div', 'card-header', 'Third-party script inventory'));
  addRow(thirdParty, 'Third-party scripts', scripts.count || 0);
  addRow(thirdParty, 'Hosts', Array.isArray(scripts.hosts) && scripts.hosts.length ? scripts.hosts.join(', ') : 'None');
  const samples = Array.isArray(scripts.sample) ? scripts.sample : [];
  if (samples.length) {
    const wrap = el('div', 'table-wrap');
    const table = document.createElement('table');
    const body = document.createElement('tbody');
    samples.forEach((item) => {
      const row = document.createElement('tr');
      row.appendChild(el('td', '', item.host || '—'));
      const url = el('td', 'cell-url code', item.url || '—');
      url.title = item.url || '';
      row.appendChild(url);
      body.appendChild(row);
    });
    table.appendChild(body);
    wrap.appendChild(table);
    thirdParty.appendChild(wrap);
  }
  thirdParty.appendChild(el('div', 'muted', 'Header and mixed-content inspection is local/read-only. The extension does not fetch external policy databases or execute page scripts for security analysis.'));
  panel.appendChild(thirdParty);
}
