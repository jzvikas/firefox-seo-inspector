'use strict';

const SIMPLE_RENDER_BATCH = 100;
const SIMPLE_RENDER_MAX = 500;

const state = {
  tabId: null,
  report: null,
  linkResults: new Map(),
  rawReport: null,
  snapshotDiff: null,
  rawDiff: null,
  indexabilityRawDiff: undefined,
  canonicalChecks: new Map(),
  robotsReport: null,
  sitemapReport: null,
  sitemapChecking: false,
  sitemapOperationId: null,
  issueFilter: 'all',
  inventoryLimits: {
    issues: SIMPLE_RENDER_BATCH,
    headings: SIMPLE_RENDER_BATCH,
  },
};

const pageUrl = document.getElementById('pageUrl');
const scoreNode = document.getElementById('score');
const statusTitle = document.getElementById('statusTitle');
const statusCounts = document.getElementById('statusCounts');

function el(tag, className, textValue) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (textValue !== undefined && textValue !== null) node.textContent = String(textValue);
  return node;
}

function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
}

function addRow(container, label, value, className) {
  const row = el('div', 'row');
  row.appendChild(el('div', 'row-label', label));
  row.appendChild(el('div', `row-value${className ? ` ${className}` : ''}`, value || '—'));
  container.appendChild(row);
}

function card(title, rows) {
  const node = el('div', 'card');
  node.appendChild(el('div', 'card-header', title));
  for (const row of rows) addRow(node, row[0], row[1], row[2]);
  return node;
}

function badge(textValue, kind) {
  return el('span', `badge ${kind || ''}`, textValue);
}

function setStatus(message, detail) {
  scoreNode.textContent = '–';
  scoreNode.className = 'score';
  statusTitle.textContent = message;
  statusCounts.textContent = detail || '';
}

function resetSimpleInventoryLimits() {
  state.inventoryLimits.issues = SIMPLE_RENDER_BATCH;
  state.inventoryLimits.headings = SIMPLE_RENDER_BATCH;
}

function appendSimpleInventoryPager(container, key, total, label, rerender) {
  const renderCap = Math.min(total, SIMPLE_RENDER_MAX);
  const shown = Math.min(state.inventoryLimits[key] || SIMPLE_RENDER_BATCH, renderCap);
  if (shown < renderCap) {
    const controls = el('div', 'toolbar');
    const next = Math.min(SIMPLE_RENDER_BATCH, renderCap - shown);
    const more = el('button', '', `Show next ${next} ${label}`);
    more.type = 'button';
    more.addEventListener('click', () => {
      state.inventoryLimits[key] = Math.min(SIMPLE_RENDER_MAX, shown + SIMPLE_RENDER_BATCH);
      rerender();
    });
    controls.appendChild(more);
    controls.appendChild(el('span', 'muted', `Rendering ${shown} of ${total} ${label}.`));
    container.appendChild(controls);
    return;
  }
  if (total > SIMPLE_RENDER_MAX) {
    container.appendChild(el('div', 'muted', `Rendering is capped at ${SIMPLE_RENDER_MAX} of ${total} ${label} to keep the Inspector responsive. Full audit data remains in the report and exports.`));
  }
}

async function activeTab() {
  const tabs = await browser.tabs.query({ active: true, currentWindow: true });
  return tabs[0] || null;
}

async function sendToTab(message) {
  if (typeof state.tabId !== 'number') throw new Error('No active tab');
  return browser.tabs.sendMessage(state.tabId, message);
}

async function refresh() {
  setStatus('Analyzing…', '');
  const tab = await activeTab();
  state.tabId = tab && typeof tab.id === 'number' ? tab.id : null;
  state.rawReport = null;
  state.rawDiff = null;
  state.indexabilityRawDiff = undefined;
  state.linkResults = new Map();
  state.robotsReport = null;
  state.sitemapReport = null;
  state.sitemapChecking = false;
  state.sitemapOperationId = null;
  resetSimpleInventoryLimits();
  pageUrl.textContent = tab && tab.url ? tab.url : '';
  pageUrl.title = tab && tab.url ? tab.url : '';

  if (!tab || !/^https?:/i.test(tab.url || '')) {
    state.report = null;
    renderAll();
    setStatus('Unsupported page', 'Open an HTTP or HTTPS page.');
    return;
  }

  try {
    const report = await sendToTab({ type: 'seoInspector.analyze' });
    state.report = report;
    const robotsReport = await browser.runtime.sendMessage({
      type: 'seoInspector.getRobots',
      url: report.facts.url,
      userAgent: 'Googlebot',
    }).catch(() => null);
    if (robotsReport) {
      state.robotsReport = robotsReport;
      report.robotsTxt = robotsReport;
      report.evaluation.indexability = Indexability.analyze(
        report.facts,
        report.responseMeta || null,
        { robotsTxt: robotsReport },
      );
    }
    await sendToTab({ type: 'seoInspector.watch', enabled: true }).catch(() => {});
    renderAll();
  } catch (_error) {
    state.report = null;
    renderAll();
    setStatus('Cannot inspect this page', 'Reload the page after installing the extension, then try again.');
  }
}

function renderHeader() {
  if (!state.report) return;
  const evaluation = state.report.evaluation;
  const score = evaluation.score;
  const indexability = evaluation.indexability;
  scoreNode.textContent = score;
  scoreNode.className = `score ${score >= 90 ? 'good' : score >= 70 ? 'warn' : 'bad'}`;
  if (indexability && !indexability.indexable) {
    scoreNode.className = `score ${indexability.verdict === Indexability.VERDICTS.CANONICALIZED || indexability.verdict === Indexability.VERDICTS.REDIRECTED ? 'warn' : 'bad'}`;
    statusTitle.textContent = `Indexability: ${indexability.verdict}`;
  } else {
    statusTitle.textContent = score >= 90 ? 'Looks healthy' : score >= 70 ? 'Needs review' : 'Important issues found';
  }
  statusCounts.textContent = `${evaluation.severityCounts.critical} critical · ${evaluation.severityCounts.warning} warnings`;
  pageUrl.textContent = state.report.facts.url || '';
  pageUrl.title = state.report.facts.url || '';
}

function renderOverview() {
  const panel = document.getElementById('overview');
  clear(panel);
  if (!state.report) {
    panel.appendChild(el('div', 'empty', 'No audit data.'));
    return;
  }
  const f = state.report.facts;
  const r = state.report.responseMeta || {};
  const h1 = f.headings.filter((item) => item.level === 1);
  const types = SeoCore.schemaTypes(f.schemas);
  const robots = f.robots.map((item) => `${item.name}: ${item.content}`).join(' · ');
  const indexability = state.report.evaluation.indexability
    || Indexability.analyze(f, r);
  panel.appendChild(card('Metadata', [
    ['Title', `${f.title || '—'}${f.title ? ` (${f.title.length})` : ''}`],
    ['Description', `${f.description || '—'}${f.description ? ` (${f.description.length})` : ''}`],
    ['Canonical', f.canonical.href || '—', 'code'],
    ['Robots meta', robots || '—'],
    ['X-Robots-Tag', (r.xRobotsTag || []).join(' · ') || '—'],
    ['HTML lang', f.lang || '—'],
    ['Viewport', f.viewport || '—'],
  ]));
  panel.appendChild(card('Page', [
    ['Indexability', indexability.verdict],
    ['robots.txt', state.robotsReport ? (state.robotsReport.blocked ? `Blocked (${state.robotsReport.rule || 'matching rule'})` : state.robotsReport.allowed === true ? 'Allowed' : 'Unknown') : 'Not checked'],
    ['HTTP', r.statusCode ? `${r.statusCode} ${r.statusLine || ''}`.trim() : 'Not captured'],
    ['Redirect hops', (r.redirectChain || []).length],
    ['H1', h1.length ? `${h1.length}: ${h1.map((item) => item.text).join(' | ')}` : '0'],
    ['Headings', f.headings.length],
    ['Words', f.textWordCount],
    ['Links', `${f.links.length} (${f.links.filter((item) => item.internal).length} internal)`],
    ['Images', f.images.length],
    ['Hreflang', f.hreflang.length],
    ['Schema', types.join(', ') || 'None'],
  ]));

  const topIssues = state.report.evaluation.issues.slice(0, 5);
  const issueCard = el('div', 'card');
  issueCard.appendChild(el('div', 'card-header', 'Top issues'));
  if (!topIssues.length) issueCard.appendChild(el('div', 'empty', 'No configured SEO issues found.'));
  else topIssues.forEach((item) => issueCard.appendChild(issueNode(item)));
  panel.appendChild(issueCard);
}

function issueNode(item) {
  const node = el('div', `issue ${item.severity}`);
  const title = el('div', 'issue-title');
  title.appendChild(el('span', '', item.title));
  title.appendChild(badge(item.severity, item.severity));
  node.appendChild(title);
  node.appendChild(el('div', 'issue-message', item.message));
  if (item.refs && item.refs.length) {
    const actions = el('div', 'issue-actions');
    const button = el('button', '', `Highlight ${item.refs.length}`);
    button.type = 'button';
    button.addEventListener('click', () => sendToTab({ type: 'seoInspector.highlight', refs: item.refs }).catch(() => {}));
    actions.appendChild(button);
    node.appendChild(actions);
  }
  return node;
}

function renderIssues() {
  const panel = document.getElementById('issues');
  clear(panel);
  if (!state.report) return panel.appendChild(el('div', 'empty', 'No audit data.'));
  const toolbar = el('div', 'toolbar');
  for (const [value, label] of [['all', 'All'], ['critical', 'Critical'], ['warning', 'Warnings']]) {
    const button = el('button', '', label);
    button.type = 'button';
    if (state.issueFilter === value) button.disabled = true;
    button.addEventListener('click', () => {
      state.issueFilter = value;
      state.inventoryLimits.issues = SIMPLE_RENDER_BATCH;
      renderIssues();
    });
    toolbar.appendChild(button);
  }
  const clearButton = el('button', '', 'Clear highlights');
  clearButton.type = 'button';
  clearButton.addEventListener('click', () => sendToTab({ type: 'seoInspector.clearHighlights' }).catch(() => {}));
  toolbar.appendChild(clearButton);
  panel.appendChild(toolbar);
  const items = state.report.evaluation.issues.filter((item) => state.issueFilter === 'all' || item.severity === state.issueFilter);
  if (!items.length) {
    panel.appendChild(el('div', 'empty', 'No issues in this filter.'));
    return;
  }
  const renderLimit = Math.min(state.inventoryLimits.issues, SIMPLE_RENDER_MAX);
  items.slice(0, renderLimit).forEach((item) => panel.appendChild(issueNode(item)));
  appendSimpleInventoryPager(panel, 'issues', items.length, 'issues', renderIssues);
}

function renderHeadings() {
  const panel = document.getElementById('headings');
  clear(panel);
  if (!state.report) return panel.appendChild(el('div', 'empty', 'No audit data.'));
  const headings = state.report.facts.headings;
  if (!headings.length) return panel.appendChild(el('div', 'empty', 'No headings found.'));
  const cardNode = el('div', 'card');
  cardNode.appendChild(el('div', 'card-header', `${headings.length} headings`));
  const renderLimit = Math.min(state.inventoryLimits.headings, SIMPLE_RENDER_MAX);
  headings.slice(0, renderLimit).forEach((item) => {
    const row = el('div', 'heading');
    row.style.paddingLeft = `${8 + Math.max(0, item.level - 1) * 14}px`;
    const button = el('button', '', `H${item.level}  ${item.text || '(empty)'}`);
    button.type = 'button';
    button.addEventListener('click', () => sendToTab({ type: 'seoInspector.highlight', refs: [item.ref] }).catch(() => {}));
    row.appendChild(button);
    cardNode.appendChild(row);
  });
  appendSimpleInventoryPager(cardNode, 'headings', headings.length, 'headings', renderHeadings);
  panel.appendChild(cardNode);
}

function statusForLink(link) {
  return state.linkResults.get(SeoCore.normalizedUrl(link.href)) || null;
}
