'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const PaginationAudit = require('../src/lib/pagination-audit.js');

function source(relative) {
  return fs.readFileSync(path.join(__dirname, '..', relative), 'utf8');
}

function node(text) {
  return {
    textContent: text || '',
    children: [],
    appendChild(child) { this.children.push(child); return child; },
  };
}

function baseDuplicateData(rows) {
  return { rows: rows.map((row) => Object.assign({}, row)), titles: [], descriptions: [], h1: [] };
}

test('pagination sidebar layer annotates same-family title and description duplicates for Tabs and Crawler', () => {
  const tabRows = [
    { tabId: 1, url: 'https://example.test/cat', title: 'Category', description: 'Browse', available: true },
    { tabId: 2, url: 'https://example.test/cat?page=2', title: 'Category', description: 'Browse', available: true },
    { tabId: 3, url: 'https://example.test/other?page=2', title: 'Category', description: 'Browse', available: true },
  ];
  const crawlRows = [
    { url: 'https://example.test/list', title: 'List', description: 'Same description', available: true },
    { url: 'https://example.test/list/page/2/', title: 'List 2', description: 'Same description', available: true },
  ];
  const context = vm.createContext({
    PaginationAudit,
    multiTabState: { rows: tabRows, duplicates: {} },
    multiTabDuplicateData: baseDuplicateData,
    multiTabFinalizeDuplicates() {},
    multiTabSummaryCard(panel) { panel.appendChild(node('base tabs')); },
    crawlerState: { rows: crawlRows, duplicates: {} },
    crawlerUpdateDuplicates() { this.crawlerState = this.crawlerState || undefined; },
    crawlerSummary(panel) { panel.appendChild(node('base crawler')); },
    el(_tag, _className, text) { return node(String(text || '')); },
    badge(text) { return node(String(text || '')); },
    addRow(container, label, value) { container.appendChild(node(`${label}: ${value}`)); },
  });

  // The crawler base function must emulate the existing generic duplicate pass.
  context.crawlerUpdateDuplicates = function crawlerUpdateDuplicatesBase() {
    context.crawlerState.rows = context.crawlerState.rows.map((row) => Object.assign({}, row));
    context.crawlerState.duplicates = { titles: [], descriptions: [], h1: [] };
  };

  vm.runInContext(source('src/sidebar/sidebar-pagination-diagnostics.js'), context, { filename: 'sidebar-pagination-diagnostics.js' });
  vm.runInContext('multiTabFinalizeDuplicates()', context);
  vm.runInContext('crawlerUpdateDuplicates()', context);

  assert.equal(context.multiTabState.duplicates.paginationTitles.length, 1);
  assert.equal(context.multiTabState.duplicates.paginationDescriptions.length, 1);
  assert.equal(context.multiTabState.rows[0].duplicatePaginationTitle, true);
  assert.equal(context.multiTabState.rows[1].duplicatePaginationTitle, true);
  assert.equal(context.multiTabState.rows[2].duplicatePaginationTitle, false);

  assert.equal(context.crawlerState.duplicates.paginationTitles.length, 0);
  assert.equal(context.crawlerState.duplicates.paginationDescriptions.length, 1);
  assert.equal(context.crawlerState.rows.every((row) => row.duplicatePaginationDescription), true);
});

test('pagination diagnostics load after Tabs/Crawler definitions and before sidebar main', () => {
  const html = source('src/sidebar/sidebar.html');
  const model = html.indexOf('../lib/pagination-audit.js');
  const multiTab = html.indexOf('sidebar-multi-tab.js');
  const crawler = html.indexOf('sidebar-crawler.js');
  const diagnostics = html.indexOf('sidebar-pagination-diagnostics.js');
  const main = html.indexOf('sidebar-main.js');
  assert.ok(model >= 0);
  assert.ok(diagnostics > multiTab);
  assert.ok(diagnostics > crawler);
  assert.ok(main > diagnostics);
});

test('Category panel re-evaluates with HTTP response metadata and reuses bounded link checker for pagination', () => {
  const category = source('src/sidebar/sidebar-category.js');
  assert.match(category, /CategoryPageAudit\.inspect\(report\.facts, report\.pageType \|\| null, report\.responseMeta \|\| null\)/);
  assert.match(category, /type: 'seoInspector\.checkLinksBounded'/);
  assert.match(category, /type: 'seoInspector\.cancelLinks'/);
  assert.match(category, /PaginationAudit\.summarizeLinkResults/);
  assert.match(category, /seoInspector\.linkCheckProgress/);
});
