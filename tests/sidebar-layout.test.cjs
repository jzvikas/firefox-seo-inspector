'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const sidebarPath = path.join(root, 'src', 'sidebar', 'sidebar.html');

function read(relative) {
  return fs.readFileSync(path.join(root, relative), 'utf8');
}

function scriptSources(html) {
  return Array.from(html.matchAll(/<script\s+src="([^"]+)"/g), (match) => match[1]);
}

function stylesheetSources(html) {
  return Array.from(html.matchAll(/<link\s+rel="stylesheet"\s+href="([^"]+)"/g), (match) => match[1]);
}

test('every sidebar script and stylesheet reference exists on disk', () => {
  const html = fs.readFileSync(sidebarPath, 'utf8');
  for (const src of scriptSources(html).concat(stylesheetSources(html))) {
    const absolute = path.resolve(path.dirname(sidebarPath), src);
    assert.equal(fs.existsSync(absolute), true, `Missing sidebar dependency: ${src}`);
  }
});

test('page type product custom rules profiles multi-tab and crawler models load before renderers and main', () => {
  const html = fs.readFileSync(sidebarPath, 'utf8');
  const scripts = scriptSources(html);
  const customRules = scripts.indexOf('../lib/custom-rules.js');
  const domainProfiles = scripts.indexOf('../lib/domain-profiles.js');
  const pageType = scripts.indexOf('../lib/page-type.js');
  const pageTypeDom = scripts.indexOf('../lib/page-type-dom.js');
  const productModel = scripts.indexOf('../lib/product-page-audit.js');
  const multiTabModel = scripts.indexOf('../lib/multi-tab-audit.js');
  const crawlerModel = scripts.indexOf('../lib/crawler-lite.js');
  const sidebarBase = scripts.indexOf('sidebar-base.js');
  const pageTypeRenderer = scripts.indexOf('sidebar-page-type.js');
  const productRenderer = scripts.indexOf('sidebar-product.js');
  const imagesNetwork = scripts.indexOf('sidebar-images-network.js');
  const imagesRules = scripts.indexOf('sidebar-images-rules.js');
  const rules = scripts.indexOf('sidebar-rules.js');
  const profiles = scripts.indexOf('sidebar-profiles.js');
  const multiTab = scripts.indexOf('sidebar-multi-tab.js');
  const crawler = scripts.indexOf('sidebar-crawler.js');
  const main = scripts.indexOf('sidebar-main.js');
  assert.ok(customRules >= 0);
  assert.ok(domainProfiles > customRules);
  assert.ok(pageType >= 0);
  assert.ok(pageTypeDom > pageType);
  assert.ok(productModel > pageTypeDom);
  assert.ok(multiTabModel >= 0);
  assert.ok(crawlerModel >= 0);
  assert.ok(sidebarBase > productModel);
  assert.ok(pageTypeRenderer > sidebarBase);
  assert.ok(productRenderer > sidebarBase);
  assert.ok(imagesNetwork >= 0);
  assert.ok(imagesRules > imagesNetwork);
  assert.ok(rules > customRules);
  assert.ok(profiles > domainProfiles);
  assert.ok(profiles > rules);
  assert.ok(multiTab > multiTabModel);
  assert.ok(crawler > crawlerModel);
  assert.ok(main > pageTypeRenderer);
  assert.ok(main > productRenderer);
  assert.ok(main > rules);
  assert.ok(main > profiles);
  assert.ok(main > multiTab);
  assert.ok(main > crawler);
  assert.ok(main > imagesRules);
});

test('Product Rules Profiles Tabs and Crawler panels stay in sync with renderAll', () => {
  const html = fs.readFileSync(sidebarPath, 'utf8');
  const main = read('src/sidebar/sidebar-main.js');
  assert.match(html, /data-tab="product"/);
  assert.match(html, /<section id="product" class="panel"><\/section>/);
  assert.match(main, /\brenderProduct\(\);/);
  assert.match(html, /data-tab="rules"/);
  assert.match(html, /<section id="rules" class="panel"><\/section>/);
  assert.match(main, /\brenderRules\(\);/);
  assert.match(html, /data-tab="profiles"/);
  assert.match(html, /<section id="profiles" class="panel"><\/section>/);
  assert.match(main, /\brenderProfiles\(\);/);
  assert.match(html, /data-tab="multitab"/);
  assert.match(html, /<section id="multitab" class="panel"><\/section>/);
  assert.match(main, /\brenderMultiTab\(\);/);
  assert.match(html, /data-tab="crawler"/);
  assert.match(html, /<section id="crawler" class="panel"><\/section>/);
  assert.match(main, /\brenderCrawler\(\);/);
});

test('content script loads page type product and policy dependencies before content bootstrap', () => {
  const manifest = JSON.parse(read('src/manifest.json'));
  const scripts = manifest.content_scripts[0].js;
  const rules = scripts.indexOf('lib/custom-rules.js');
  const profiles = scripts.indexOf('lib/domain-profiles.js');
  const pageType = scripts.indexOf('lib/page-type.js');
  const pageTypeDom = scripts.indexOf('lib/page-type-dom.js');
  const productAudit = scripts.indexOf('lib/product-page-audit.js');
  const content = scripts.indexOf('content/content.js');
  assert.ok(rules >= 0);
  assert.ok(profiles > rules);
  assert.ok(pageType > profiles);
  assert.ok(pageTypeDom > pageType);
  assert.ok(productAudit > pageTypeDom);
  assert.ok(content > productAudit);
});

test('crawler background is registered and page type/product audit add no new permission', () => {
  const manifest = JSON.parse(read('src/manifest.json'));
  assert.ok(manifest.background.scripts.includes('background/crawler-background.js'));
  assert.deepEqual(manifest.permissions.slice().sort(), ['storage', 'tabs', 'webRequest']);
});

test('Profiles source remains public-safe and does not embed configured hostnames', () => {
  const source = read('src/sidebar/sidebar-profiles.js');
  const model = read('src/lib/domain-profiles.js');
  assert.doesNotMatch(source, /profiles\s*:\s*\{\s*["'][^"']+\.[^"']+["']\s*:/);
  assert.doesNotMatch(model, /profiles\s*:\s*\{\s*["'][^"']+\.[^"']+["']\s*:/);
});
