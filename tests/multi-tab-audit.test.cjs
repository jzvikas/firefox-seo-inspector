'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const MultiTabAudit = require('../src/lib/multi-tab-audit.js');

function report(overrides) {
  const extra = overrides || {};
  return {
    facts: Object.assign({
      url: 'https://example.com/a',
      title: 'Page A',
      description: 'Description A',
      headings: [{ level: 1, text: 'Heading A' }],
      canonical: { href: 'https://example.com/a' },
      robots: [{ content: 'index,follow' }],
    }, extra.facts || {}),
    responseMeta: Object.assign({ statusCode: 200 }, extra.responseMeta || {}),
    evaluation: Object.assign({
      score: 95,
      issues: [{ id: 'x', severity: 'warning' }],
      severityCounts: { critical: 0, warning: 1 },
      indexability: { verdict: 'Indexable' },
    }, extra.evaluation || {}),
  };
}

test('selectTabs keeps unique HTTP/HTTPS tabs and enforces cap', () => {
  const rows = MultiTabAudit.selectTabs([
    { id: 1, url: 'https://example.com/a', title: 'A' },
    { id: 2, url: 'about:config', title: 'No' },
    { id: 1, url: 'https://example.com/duplicate', title: 'Dup' },
    { id: 3, url: 'http://example.com/b', title: 'B' },
  ], 1);
  assert.deepEqual(rows.map((item) => item.id), [1]);
});

test('summarizeReport extracts bounded SEO fields and issue counts', () => {
  const row = MultiTabAudit.summarizeReport({ id: 7, url: 'https://example.com/a', title: 'Tab A', windowId: 2 }, report());
  assert.equal(row.url, 'https://example.com/a');
  assert.equal(row.statusCode, 200);
  assert.equal(row.title, 'Page A');
  assert.equal(row.h1, 'Heading A');
  assert.equal(row.h1Count, 1);
  assert.equal(row.indexability, 'Indexable');
  assert.equal(row.issueCount, 1);
  assert.equal(row.warnings, 1);
});

test('unavailableRow preserves tab identity without inventing audit facts', () => {
  const row = MultiTabAudit.unavailableRow({ id: 9, url: 'https://example.com/', title: 'Tab' }, 'no-content-script');
  assert.equal(row.available, false);
  assert.equal(row.url, 'https://example.com/');
  assert.equal(row.statusCode, 0);
  assert.equal(row.indexability, 'Unknown');
  assert.equal(row.error, 'no-content-script');
});

test('duplicate groups ignore empty values and match normalized text', () => {
  const rows = [
    Object.assign(MultiTabAudit.summarizeReport({ id: 1 }, report()), { title: ' Same   Title ' }),
    Object.assign(MultiTabAudit.summarizeReport({ id: 2 }, report()), { title: 'same title' }),
    Object.assign(MultiTabAudit.summarizeReport({ id: 3 }, report()), { title: '' }),
  ];
  const groups = MultiTabAudit.duplicateGroups(rows, 'title');
  assert.equal(groups.length, 1);
  assert.equal(groups[0].count, 2);
  assert.deepEqual(groups[0].tabIds, [1, 2]);
});

test('annotateDuplicates marks title description and H1 independently', () => {
  const rows = [
    Object.assign(MultiTabAudit.summarizeReport({ id: 1 }, report()), { title: 'T', description: 'D1', h1: 'H' }),
    Object.assign(MultiTabAudit.summarizeReport({ id: 2 }, report()), { title: 'T', description: 'D2', h1: 'H' }),
    Object.assign(MultiTabAudit.summarizeReport({ id: 3 }, report()), { title: 'T3', description: 'D2', h1: 'H3' }),
  ];
  const annotated = MultiTabAudit.annotateDuplicates(rows);
  assert.equal(annotated[0].duplicateTitle, true);
  assert.equal(annotated[0].duplicateDescription, false);
  assert.equal(annotated[0].duplicateH1, true);
  assert.equal(annotated[2].duplicateDescription, true);
});

test('duplicateSummary exposes grouped duplicate metadata', () => {
  const rows = [
    Object.assign(MultiTabAudit.summarizeReport({ id: 1 }, report()), { title: 'Same' }),
    Object.assign(MultiTabAudit.summarizeReport({ id: 2 }, report()), { title: 'Same' }),
  ];
  const result = MultiTabAudit.duplicateSummary(rows);
  assert.equal(result.titles.length, 1);
  assert.equal(result.rows.every((row) => row.duplicateTitle), true);
});

test('filterRows supports query indexability issue and duplicate filters together', () => {
  const rows = [
    Object.assign(MultiTabAudit.summarizeReport({ id: 1 }, report()), { duplicateTitle: true }),
    Object.assign(MultiTabAudit.summarizeReport({ id: 2 }, report({ facts: { url: 'https://example.com/b', title: 'Other' }, evaluation: { issues: [], severityCounts: {}, indexability: { verdict: 'Noindex' } } })), { duplicateTitle: false }),
  ];
  const filtered = MultiTabAudit.filterRows(rows, { query: 'page a', indexability: 'Indexable', issuesOnly: true, duplicatesOnly: true });
  assert.deepEqual(filtered.map((row) => row.tabId), [1]);
});

test('sortRows handles numeric and text fields deterministically', () => {
  const rows = [
    Object.assign(MultiTabAudit.summarizeReport({ id: 1 }, report()), { score: 80, url: 'https://b.example/' }),
    Object.assign(MultiTabAudit.summarizeReport({ id: 2 }, report()), { score: 95, url: 'https://a.example/' }),
  ];
  assert.deepEqual(MultiTabAudit.sortRows(rows, 'score', 'desc').map((row) => row.tabId), [2, 1]);
  assert.deepEqual(MultiTabAudit.sortRows(rows, 'url', 'asc').map((row) => row.tabId), [2, 1]);
});

test('CSV escaping preserves commas quotes and newlines', () => {
  const csv = MultiTabAudit.toCsv([{ url: 'https://example.com/a,b', title: 'A "quoted" title', description: 'one\ntwo' }]);
  assert.match(csv, /"https:\/\/example\.com\/a,b"/);
  assert.match(csv, /"A ""quoted"" title"/);
  assert.match(csv, /"one\ntwo"/);
});

test('JSON export contains version rows and duplicate summary', () => {
  const text = MultiTabAudit.toJson([{ url: 'https://example.com/' }], { titles: [] });
  const parsed = JSON.parse(text);
  assert.equal(parsed.version, 1);
  assert.equal(parsed.rows.length, 1);
  assert.deepEqual(parsed.duplicates.titles, []);
});
