'use strict';

const crawlerState = {
  running: false,
  paused: false,
  cancelling: false,
  scanId: 0,
  seedUrl: '',
  options: CrawlerLite.normalizeOptions(null),
  rows: [],
  duplicates: { titles: [], descriptions: [], h1: [] },
  processed: 0,
  discovered: 0,
  currentDepth: 0,
  error: '',
  query: '',
  errorsOnly: false,
  redirectsOnly: false,
  duplicatesOnly: false,
  issuesOnly: false,
  sortKey: 'depth',
  sortDirection: 'asc',
};

function crawlerCurrentPageUrl() {
  return state.report && state.report.facts ? CrawlerLite.normalizeUrl(state.report.facts.url) : '';
}

function crawlerDownload(filename, type, content) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function crawlerUpdateDuplicates() {
  const data = CrawlerLite.annotateDuplicates(crawlerState.rows);
  crawlerState.rows = data.rows;
  crawlerState.duplicates = { titles: data.titles, descriptions: data.descriptions, h1: data.h1 };
}

function crawlerFilteredRows() {
  return CrawlerLite.sortRows(CrawlerLite.filterRows(crawlerState.rows, {
    query: crawlerState.query,
    errorsOnly: crawlerState.errorsOnly,
    redirectsOnly: crawlerState.redirectsOnly,
    duplicatesOnly: crawlerState.duplicatesOnly,
    issuesOnly: crawlerState.issuesOnly,
  }), crawlerState.sortKey, crawlerState.sortDirection);
}

function crawlerErrorLabel(resource) {
  const reason = String(resource && resource.error || 'network');
  if (reason === 'timeout') return 'Request timed out.';
  if (reason === 'too-large') return 'HTML exceeded the 2 MiB safety limit.';
  if (reason === 'not-html') return 'Response is not HTML/XHTML.';
  if (reason === 'cancelled') return 'Cancelled.';
  if (reason === 'invalid-request') return 'Invalid crawl request.';
  return 'Network request failed.';
}

async function crawlerWaitIfPaused(scanId) {
  while (crawlerState.running && crawlerState.paused && !crawlerState.cancelling && crawlerState.scanId === scanId) {
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

async function crawlerFetchUrl(url, scanId) {
  return browser.runtime.sendMessage({ type: 'seoInspector.crawler.fetch', scanId: String(scanId), url });
}

async function crawlerProcessOne(item, scanId, seen, nextCandidates) {
  await crawlerWaitIfPaused(scanId);
  if (!crawlerState.running || crawlerState.cancelling || crawlerState.scanId !== scanId) return;

  const resource = await crawlerFetchUrl(item.url, scanId).catch(() => ({ requestedUrl: item.url, url: item.url, status: 0, error: 'network' }));
  if (crawlerState.scanId !== scanId) return;
  if (resource && resource.error) {
    const row = CrawlerLite.errorRow(item.url, item.depth, item.sourceUrl, resource);
    row.error = crawlerErrorLabel(resource);
    crawlerState.rows.push(row);
    crawlerState.processed += 1;
    crawlerUpdateDuplicates();
    renderCrawler();
    return;
  }

  try {
    const report = await reportFromFetchedCompare(resource);
    const row = CrawlerLite.summarize(resource, report, item.depth, item.sourceUrl);
    crawlerState.rows.push(row);
    const finalUrl = CrawlerLite.normalizeUrl(resource.url);
    if (finalUrl) seen.add(finalUrl);
    if (item.depth < crawlerState.options.depthLimit) {
      const links = CrawlerLite.discoverLinks(report.facts, crawlerState.seedUrl, crawlerState.options);
      links.forEach((url) => nextCandidates.push({ url, sourceUrl: finalUrl || item.url }));
    }
  } catch (_error) {
    const row = CrawlerLite.errorRow(item.url, item.depth, item.sourceUrl, { status: resource.status, url: resource.url, redirected: resource.redirected, error: 'parse' });
    row.error = 'HTML could not be analyzed.';
    crawlerState.rows.push(row);
  }
  crawlerState.processed += 1;
  crawlerUpdateDuplicates();
  renderCrawler();
}

async function crawlerProcessDepth(frontier, depth, scanId, seen) {
  const nextCandidates = [];
  let cursor = 0;
  async function worker() {
    while (crawlerState.running && !crawlerState.cancelling && crawlerState.scanId === scanId) {
      await crawlerWaitIfPaused(scanId);
      if (!crawlerState.running || crawlerState.cancelling || crawlerState.scanId !== scanId) return;
      const index = cursor;
      cursor += 1;
      if (index >= frontier.length) return;
      await crawlerProcessOne(frontier[index], scanId, seen, nextCandidates);
    }
  }
  const workers = Array.from({ length: Math.min(CrawlerLite.CONCURRENCY, frontier.length) }, () => worker());
  await Promise.all(workers);
  return nextCandidates;
}

async function runCrawler() {
  if (crawlerState.running) return;
  const seed = CrawlerLite.normalizeUrl(crawlerState.seedUrl || crawlerCurrentPageUrl());
  if (!seed) {
    crawlerState.error = 'Enter a valid HTTP or HTTPS seed URL.';
    renderCrawler();
    return;
  }
  const options = CrawlerLite.normalizeOptions(crawlerState.options);
  const scanId = Date.now() + Math.floor(Math.random() * 100000);
  crawlerState.scanId = scanId;
  crawlerState.seedUrl = seed;
  crawlerState.options = options;
  crawlerState.rows = [];
  crawlerState.duplicates = { titles: [], descriptions: [], h1: [] };
  crawlerState.processed = 0;
  crawlerState.discovered = 1;
  crawlerState.currentDepth = 0;
  crawlerState.error = '';
  crawlerState.running = true;
  crawlerState.paused = false;
  crawlerState.cancelling = false;
  renderCrawler();

  const seen = new Set([seed]);
  let frontier = [{ url: seed, sourceUrl: '', depth: 0 }];
  try {
    for (let depth = 0; depth <= options.depthLimit && frontier.length; depth += 1) {
      if (crawlerState.cancelling || crawlerState.scanId !== scanId) break;
      crawlerState.currentDepth = depth;
      renderCrawler();
      const candidates = await crawlerProcessDepth(frontier, depth, scanId, seen);
      if (crawlerState.cancelling || crawlerState.scanId !== scanId) break;
      const remaining = options.urlLimit - seen.size;
      if (remaining <= 0 || depth >= options.depthLimit) break;
      const next = CrawlerLite.nextFrontier(candidates.map((item) => item.url), seen, remaining);
      const sourceByUrl = new Map();
      candidates.forEach((item) => { if (!sourceByUrl.has(item.url)) sourceByUrl.set(item.url, item.sourceUrl); });
      frontier = next.urls.map((url) => ({ url, sourceUrl: sourceByUrl.get(url) || '', depth: depth + 1 }));
      crawlerState.discovered = seen.size;
    }
  } catch (_error) {
    crawlerState.error = 'Crawler stopped after an unexpected local error.';
  } finally {
    if (crawlerState.scanId === scanId) {
      crawlerState.running = false;
      crawlerState.paused = false;
      crawlerState.cancelling = false;
      crawlerUpdateDuplicates();
      renderCrawler();
    }
  }
}

function pauseCrawler() {
  if (!crawlerState.running || crawlerState.cancelling) return;
  crawlerState.paused = true;
  renderCrawler();
}

function resumeCrawler() {
  if (!crawlerState.running || crawlerState.cancelling) return;
  crawlerState.paused = false;
  renderCrawler();
}

async function cancelCrawler() {
  if (!crawlerState.running || crawlerState.cancelling) return;
  crawlerState.cancelling = true;
  crawlerState.paused = false;
  renderCrawler();
  await browser.runtime.sendMessage({ type: 'seoInspector.crawler.cancel', scanId: String(crawlerState.scanId) }).catch(() => null);
}

function crawlerConfigCard(panel) {
  const card = el('div', 'card');
  card.appendChild(el('div', 'card-header', 'Crawler Lite'));
  card.appendChild(el('div', 'serp-note', `Explicit local crawl with hard limits: max ${CrawlerLite.MAX_URLS} URLs, depth ${CrawlerLite.MAX_DEPTH}, ${CrawlerLite.CONCURRENCY} concurrent credential-free requests, 12 s/request, 2 MiB HTML/URL. Same-host is enabled by default.`));

  const grid = el('div', 'crawler-config-grid');
  const seed = document.createElement('input');
  seed.type = 'url';
  seed.placeholder = 'https://example.com/';
  seed.value = crawlerState.seedUrl || crawlerCurrentPageUrl();
  seed.disabled = crawlerState.running;
  grid.appendChild(seed);

  const urlLimit = document.createElement('input');
  urlLimit.type = 'number';
  urlLimit.min = '1';
  urlLimit.max = String(CrawlerLite.MAX_URLS);
  urlLimit.value = String(crawlerState.options.urlLimit);
  urlLimit.title = 'Maximum URLs';
  urlLimit.disabled = crawlerState.running;
  grid.appendChild(urlLimit);

  const depth = document.createElement('input');
  depth.type = 'number';
  depth.min = '0';
  depth.max = String(CrawlerLite.MAX_DEPTH);
  depth.value = String(crawlerState.options.depthLimit);
  depth.title = 'Maximum crawl depth';
  depth.disabled = crawlerState.running;
  grid.appendChild(depth);

  const sameHostLabel = el('label', 'crawler-check');
  const sameHost = document.createElement('input');
  sameHost.type = 'checkbox';
  sameHost.checked = crawlerState.options.sameHostnameOnly;
  sameHost.disabled = crawlerState.running;
  sameHostLabel.appendChild(sameHost);
  sameHostLabel.appendChild(document.createTextNode('Same hostname only'));
  grid.appendChild(sameHostLabel);
  card.appendChild(grid);

  const toolbar = el('div', 'toolbar');
  const start = el('button', '', crawlerState.running ? 'Crawling…' : 'Start crawl');
  start.type = 'button';
  start.disabled = crawlerState.running;
  start.addEventListener('click', () => {
    crawlerState.seedUrl = seed.value;
    crawlerState.options = CrawlerLite.normalizeOptions({ urlLimit: urlLimit.value, depthLimit: depth.value, sameHostnameOnly: sameHost.checked });
    runCrawler().catch(() => {});
  });
  toolbar.appendChild(start);
  if (crawlerState.running && !crawlerState.paused) {
    const pause = el('button', '', 'Pause');
    pause.type = 'button';
    pause.disabled = crawlerState.cancelling;
    pause.addEventListener('click', pauseCrawler);
    toolbar.appendChild(pause);
  }
  if (crawlerState.running && crawlerState.paused) {
    const resume = el('button', '', 'Resume');
    resume.type = 'button';
    resume.disabled = crawlerState.cancelling;
    resume.addEventListener('click', resumeCrawler);
    toolbar.appendChild(resume);
  }
  if (crawlerState.running) {
    const cancel = el('button', '', crawlerState.cancelling ? 'Cancelling…' : 'Cancel');
    cancel.type = 'button';
    cancel.disabled = crawlerState.cancelling;
    cancel.addEventListener('click', () => cancelCrawler().catch(() => {}));
    toolbar.appendChild(cancel);
  }
  if (crawlerState.rows.length) {
    const csv = el('button', '', 'Export CSV');
    csv.type = 'button';
    csv.addEventListener('click', () => crawlerDownload('seo-inspector-crawl.csv', 'text/csv;charset=utf-8', CrawlerLite.toCsv(crawlerState.rows)));
    toolbar.appendChild(csv);
    const json = el('button', '', 'Export JSON');
    json.type = 'button';
    json.addEventListener('click', () => crawlerDownload('seo-inspector-crawl.json', 'application/json', CrawlerLite.toJson(crawlerState.seedUrl, crawlerState.options, crawlerState.rows, crawlerState.duplicates)));
    toolbar.appendChild(json);
  }
  card.appendChild(toolbar);
  panel.appendChild(card);
}

function crawlerSummary(panel) {
  const card = el('div', 'card');
  card.appendChild(el('div', 'card-header', 'Crawl summary'));
  const failures = crawlerState.rows.filter((row) => !row.available || row.statusCode >= 400).length;
  const redirects = crawlerState.rows.filter((row) => row.redirected).length;
  const badges = el('div', 'toolbar');
  badges.appendChild(badge(`${crawlerState.processed} processed`, crawlerState.running ? 'info' : 'ok'));
  badges.appendChild(badge(`${crawlerState.discovered} discovered`, 'info'));
  badges.appendChild(badge(`depth ${crawlerState.currentDepth}/${crawlerState.options.depthLimit}`, 'info'));
  if (failures) badges.appendChild(badge(`${failures} errors`, 'critical'));
  if (redirects) badges.appendChild(badge(`${redirects} redirects`, 'warning'));
  card.appendChild(badges);
  if (crawlerState.running) {
    const progress = document.createElement('progress');
    progress.max = crawlerState.options.urlLimit;
    progress.value = Math.min(crawlerState.processed, crawlerState.options.urlLimit);
    progress.className = 'crawler-progress';
    card.appendChild(progress);
    card.appendChild(el('div', 'muted', crawlerState.cancelling ? 'Cancelling in-flight requests…' : (crawlerState.paused ? 'Paused. In-flight requests may finish; no new requests are scheduled.' : 'Crawl in progress…')));
  }
  const dups = el('div', 'crawler-duplicates');
  dups.appendChild(badge(`${crawlerState.duplicates.titles.length} duplicate title groups`, crawlerState.duplicates.titles.length ? 'warning' : 'ok'));
  dups.appendChild(badge(`${crawlerState.duplicates.descriptions.length} duplicate description groups`, crawlerState.duplicates.descriptions.length ? 'warning' : 'ok'));
  dups.appendChild(badge(`${crawlerState.duplicates.h1.length} duplicate H1 groups`, crawlerState.duplicates.h1.length ? 'warning' : 'ok'));
  card.appendChild(dups);
  panel.appendChild(card);
}

function crawlerFilters(panel) {
  if (!crawlerState.rows.length) return;
  const card = el('div', 'card');
  card.appendChild(el('div', 'card-header', 'Filter and sort'));
  const grid = el('div', 'crawler-filter-grid');
  const query = document.createElement('input');
  query.type = 'search';
  query.placeholder = 'Search URL, title, H1, canonical…';
  query.value = crawlerState.query;
  grid.appendChild(query);
  const sort = document.createElement('select');
  [['depth', 'Sort: Depth'], ['url', 'Sort: URL'], ['statusCode', 'Sort: HTTP'], ['title', 'Sort: Title'], ['h1', 'Sort: H1'], ['indexability', 'Sort: Indexability'], ['score', 'Sort: Score'], ['issueCount', 'Sort: Issues']].forEach(([value, label]) => {
    const option = document.createElement('option'); option.value = value; option.textContent = label; option.selected = value === crawlerState.sortKey; sort.appendChild(option);
  });
  grid.appendChild(sort);
  const direction = document.createElement('select');
  [['asc', 'Ascending'], ['desc', 'Descending']].forEach(([value, label]) => { const option = document.createElement('option'); option.value = value; option.textContent = label; option.selected = value === crawlerState.sortDirection; direction.appendChild(option); });
  grid.appendChild(direction);
  card.appendChild(grid);
  const toggles = el('div', 'toolbar');
  function toggle(label, checked) { const wrapper = el('label', 'crawler-check'); const input = document.createElement('input'); input.type = 'checkbox'; input.checked = checked; wrapper.appendChild(input); wrapper.appendChild(document.createTextNode(label)); toggles.appendChild(wrapper); return input; }
  const errors = toggle('Errors only', crawlerState.errorsOnly);
  const redirects = toggle('Redirects only', crawlerState.redirectsOnly);
  const duplicates = toggle('Duplicates only', crawlerState.duplicatesOnly);
  const issues = toggle('Issues only', crawlerState.issuesOnly);
  const apply = el('button', '', 'Apply');
  apply.type = 'button';
  apply.addEventListener('click', () => {
    crawlerState.query = query.value; crawlerState.sortKey = sort.value; crawlerState.sortDirection = direction.value;
    crawlerState.errorsOnly = errors.checked; crawlerState.redirectsOnly = redirects.checked; crawlerState.duplicatesOnly = duplicates.checked; crawlerState.issuesOnly = issues.checked;
    renderCrawler();
  });
  toggles.appendChild(apply);
  card.appendChild(toggles);
  panel.appendChild(card);
}

function crawlerTable(panel) {
  const rows = crawlerFilteredRows();
  const card = el('div', 'card crawler-results-card');
  card.appendChild(el('div', 'card-header', `Results (${rows.length}/${crawlerState.rows.length})`));
  if (!crawlerState.rows.length) {
    card.appendChild(el('div', 'empty', 'Start a bounded crawl to collect page-level SEO facts.'));
    panel.appendChild(card); return;
  }
  if (!rows.length) { card.appendChild(el('div', 'empty', 'No rows match the current filters.')); panel.appendChild(card); return; }
  const wrap = el('div', 'crawler-table-wrap');
  const table = document.createElement('table'); table.className = 'crawler-table';
  const thead = document.createElement('thead'); const trh = document.createElement('tr');
  ['Depth', 'HTTP', 'URL / Title', 'H1', 'Indexability', 'Issues'].forEach((label) => { const th = document.createElement('th'); th.textContent = label; trh.appendChild(th); });
  thead.appendChild(trh); table.appendChild(thead);
  const tbody = document.createElement('tbody');
  rows.forEach((row) => {
    const tr = document.createElement('tr'); if (!row.available || row.statusCode >= 400) tr.className = 'crawler-error-row';
    const depth = document.createElement('td'); depth.textContent = String(row.depth); tr.appendChild(depth);
    const status = document.createElement('td'); status.textContent = row.statusCode ? String(row.statusCode) : '—'; if (row.redirected) status.appendChild(el('div', 'muted', 'redirect')); tr.appendChild(status);
    const page = document.createElement('td'); page.appendChild(el('div', 'url crawler-url', row.url || row.requestedUrl || '—')); page.appendChild(el('div', '', row.title || 'No title'));
    const flags = el('div', 'crawler-flags'); if (row.duplicateTitle) flags.appendChild(badge('duplicate title', 'warning')); if (row.duplicateDescription) flags.appendChild(badge('duplicate description', 'warning')); if (row.duplicateH1) flags.appendChild(badge('duplicate H1', 'warning')); if (row.error) flags.appendChild(badge(row.error, 'warning')); page.appendChild(flags); tr.appendChild(page);
    const h1 = document.createElement('td'); h1.textContent = row.h1 || '—'; tr.appendChild(h1);
    const index = document.createElement('td'); index.appendChild(badge(row.indexability || 'Unknown', row.indexability === 'Indexable' ? 'ok' : (row.indexability === 'Error' ? 'critical' : 'warning'))); tr.appendChild(index);
    const issue = document.createElement('td'); issue.textContent = String(row.issueCount || 0); if (row.critical) issue.appendChild(el('div', 'muted', `${row.critical} critical`)); if (row.warnings) issue.appendChild(el('div', 'muted', `${row.warnings} warnings`)); tr.appendChild(issue);
    tbody.appendChild(tr);
  });
  table.appendChild(tbody); wrap.appendChild(table); card.appendChild(wrap); panel.appendChild(card);
}

function renderCrawler() {
  const panel = document.getElementById('crawler');
  if (!panel) return;
  clear(panel);
  if (!crawlerState.seedUrl) crawlerState.seedUrl = crawlerCurrentPageUrl();
  crawlerConfigCard(panel);
  if (crawlerState.error) panel.appendChild(el('div', 'issue critical', crawlerState.error));
  crawlerSummary(panel);
  crawlerFilters(panel);
  crawlerTable(panel);
}
