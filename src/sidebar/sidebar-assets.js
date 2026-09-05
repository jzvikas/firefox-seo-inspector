'use strict';

function assetSizeLabel(item) {
  if (!item || !item.sizeKnown) return 'Unknown';
  return performanceBytes(item.sizeBytes);
}

function assetFlags(script) {
  const flags = [];
  if (script.async) flags.push('async');
  if (script.defer) flags.push('defer');
  if (script.module) flags.push('module');
  if (script.nomodule) flags.push('nomodule');
  return flags.join(', ') || 'blocking/default';
}

function appendAssetTable(container, headers, rows, urlColumnIndex) {
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
    values.forEach((value, index) => {
      const cell = el('td', index === urlColumnIndex ? 'cell-url code' : '', value === '' ? '—' : value);
      if (index === urlColumnIndex) cell.title = value || '';
      row.appendChild(cell);
    });
    body.appendChild(row);
  });
  table.appendChild(body);
  wrap.appendChild(table);
  container.appendChild(wrap);
}

function appendAssetIssues(panel, issues) {
  const cardNode = el('div', 'card');
  cardNode.appendChild(el('div', 'card-header', `JavaScript / CSS issues · ${(issues || []).length}`));
  if (!Array.isArray(issues) || !issues.length) {
    cardNode.appendChild(el('div', 'empty', 'No configured JavaScript/CSS asset warnings were triggered.'));
  } else {
    issues.forEach((issue) => {
      const node = el('div', `issue ${issue.severity || 'warning'}`);
      const title = el('div', 'issue-title');
      title.appendChild(el('span', '', issue.title || issue.code || 'Asset warning'));
      title.appendChild(badge(issue.severity || 'warning', issue.severity || 'warning'));
      node.appendChild(title);
      node.appendChild(el('div', 'issue-message', issue.message || ''));
      cardNode.appendChild(node);
    });
  }
  panel.appendChild(cardNode);
}

function renderAssetAudit() {
  const panel = document.getElementById('performance');
  if (!panel || !state.report) return;
  const report = state.report.assetAudit;
  if (!report) {
    panel.appendChild(el('div', 'muted', 'JavaScript/CSS asset audit is unavailable. Reload the page after updating the extension.'));
    return;
  }

  const scripts = Array.isArray(report.scripts) ? report.scripts : [];
  const stylesheets = Array.isArray(report.stylesheets) ? report.stylesheets : [];
  const inlineStyles = Array.isArray(report.inlineStyles) ? report.inlineStyles : [];
  const scriptSummary = report.scriptSummary || {};

  const summary = el('div', 'card');
  summary.appendChild(el('div', 'card-header', 'JavaScript and CSS audit'));
  addRow(summary, 'Scripts', `${scriptSummary.total || 0} total · ${scriptSummary.external || 0} external · ${scriptSummary.inline || 0} inline`);
  addRow(summary, 'Script loading flags', `${scriptSummary.async || 0} async · ${scriptSummary.defer || 0} defer · ${scriptSummary.module || 0} module · ${scriptSummary.nomodule || 0} nomodule`);
  addRow(summary, 'Third-party scripts', scriptSummary.thirdParty || 0);
  addRow(summary, 'Stylesheets', `${stylesheets.length} external · ${inlineStyles.length} inline <style>`);
  addRow(summary, 'Duplicate script URLs', (report.duplicateScripts || []).length);
  addRow(summary, 'Duplicate stylesheet URLs', (report.duplicateStylesheets || []).length);
  addRow(summary, 'Large JavaScript', `${(report.largeJs || []).length} ≥ ${performanceBytes(report.thresholds ? report.thresholds.largeJsBytes : 0)}`);
  addRow(summary, 'Large CSS', `${(report.largeCss || []).length} ≥ ${performanceBytes(report.thresholds ? report.thresholds.largeCssBytes : 0)}`);
  if (report.capped && (report.capped.scripts || report.capped.stylesheets || report.capped.inlineStyles)) {
    addRow(summary, 'Inventory cap', 'At least one asset inventory reached the 1,000-item safety cap.');
  }
  panel.appendChild(summary);

  appendAssetIssues(panel, report.issues || []);

  const jsCard = el('div', 'card');
  jsCard.appendChild(el('div', 'card-header', `JavaScript inventory · ${scripts.length}`));
  if (!scripts.length) {
    jsCard.appendChild(el('div', 'empty', 'No script elements found.'));
  } else {
    const rows = scripts.slice(0, 300).map((script) => [
      script.inline ? 'inline' : 'external',
      assetFlags(script),
      script.external ? (script.thirdParty ? '3rd-party' : '1st-party') : 'inline',
      script.inline ? `${script.inlineBytes || 0} chars` : assetSizeLabel(script),
      script.external && script.resourceTiming ? performanceMs(script.duration) : '—',
      script.external ? script.url || '—' : `inline script #${script.index + 1}`,
    ]);
    appendAssetTable(jsCard, ['Kind', 'Flags', 'Origin', 'Size', 'Time', 'Resource'], rows, 5);
    if (scripts.length > 300) jsCard.appendChild(el('div', 'muted', `Showing first 300 of ${scripts.length} scripts.`));
  }
  jsCard.appendChild(el('div', 'muted', 'Inline script source is not copied into this inventory; only its character count and loading metadata are retained.'));
  panel.appendChild(jsCard);

  const cssCard = el('div', 'card');
  cssCard.appendChild(el('div', 'card-header', `Stylesheet inventory · ${stylesheets.length} external`));
  if (!stylesheets.length) {
    cssCard.appendChild(el('div', 'empty', 'No external stylesheets found.'));
  } else {
    const rows = stylesheets.slice(0, 300).map((sheet) => [
      sheet.media || 'all',
      sheet.disabled ? 'disabled' : 'enabled',
      sheet.thirdParty ? '3rd-party' : '1st-party',
      assetSizeLabel(sheet),
      sheet.resourceTiming ? performanceMs(sheet.duration) : '—',
      sheet.url || '—',
    ]);
    appendAssetTable(cssCard, ['Media', 'State', 'Origin', 'Size', 'Time', 'Resource'], rows, 5);
    if (stylesheets.length > 300) cssCard.appendChild(el('div', 'muted', `Showing first 300 of ${stylesheets.length} stylesheets.`));
  }
  if (inlineStyles.length) {
    const totalInlineBytes = inlineStyles.reduce((sum, item) => sum + (Number(item.bytes) || 0), 0);
    cssCard.appendChild(el('div', 'muted', `${inlineStyles.length} inline <style> block(s), ${totalInlineBytes.toLocaleString()} characters total.`));
  }
  panel.appendChild(cssCard);

  const duplicateCard = el('div', 'card');
  duplicateCard.appendChild(el('div', 'card-header', 'Duplicate assets'));
  const duplicateRows = [];
  (report.duplicateScripts || []).forEach((item) => duplicateRows.push(['JavaScript', `${item.count}×`, item.url]));
  (report.duplicateStylesheets || []).forEach((item) => duplicateRows.push(['CSS', `${item.count}×`, item.url]));
  if (!duplicateRows.length) duplicateCard.appendChild(el('div', 'empty', 'No duplicate external JavaScript or stylesheet URLs found.'));
  else appendAssetTable(duplicateCard, ['Type', 'Count', 'URL'], duplicateRows.slice(0, 200), 2);
  panel.appendChild(duplicateCard);

  const thirdParty = el('div', 'card');
  const groups = Array.isArray(report.thirdPartyGroups) ? report.thirdPartyGroups : [];
  thirdParty.appendChild(el('div', 'card-header', `Third-party script domains · ${groups.length}`));
  if (!groups.length) {
    thirdParty.appendChild(el('div', 'empty', 'No third-party external scripts found.'));
  } else {
    const rows = groups.slice(0, 100).map((group) => [
      group.host,
      group.count,
      `${group.knownSizeCount || 0}/${group.count}`,
      group.knownSizeCount ? performanceBytes(group.knownBytes) : 'Unknown',
    ]);
    appendAssetTable(thirdParty, ['Host', 'Scripts', 'Sized', 'Known bytes'], rows, -1);
    if (groups.length > 100) thirdParty.appendChild(el('div', 'muted', `Showing first 100 of ${groups.length} third-party script domains.`));
  }
  panel.appendChild(thirdParty);

  const large = el('div', 'card');
  const largeItems = [];
  (report.largeJs || []).forEach((item) => largeItems.push(['JavaScript', assetSizeLabel(item), item.resourceTiming ? performanceMs(item.duration) : '—', item.url]));
  (report.largeCss || []).forEach((item) => largeItems.push(['CSS', assetSizeLabel(item), item.resourceTiming ? performanceMs(item.duration) : '—', item.url]));
  largeItems.sort((a, b) => {
    const parse = (value) => {
      const match = String(value).match(/^([0-9.]+)\s*(B|KB|MB)$/);
      if (!match) return 0;
      const multiplier = match[2] === 'MB' ? 1024 * 1024 : match[2] === 'KB' ? 1024 : 1;
      return Number(match[1]) * multiplier;
    };
    return parse(b[1]) - parse(a[1]);
  });
  large.appendChild(el('div', 'card-header', `Large JS/CSS resources · ${largeItems.length}`));
  if (!largeItems.length) large.appendChild(el('div', 'empty', 'No known-size JS/CSS resources exceed the configured thresholds.'));
  else appendAssetTable(large, ['Type', 'Size', 'Time', 'URL'], largeItems.slice(0, 100), 3);
  panel.appendChild(large);

  panel.appendChild(el('div', 'muted', 'External asset sizes come from existing Resource Timing data. Unknown cross-origin/cache sizes stay unknown; the audit does not fetch assets again.'));
}
