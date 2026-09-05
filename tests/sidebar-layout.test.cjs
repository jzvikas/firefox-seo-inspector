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

test('custom rules and domain profiles load before their renderers and main bootstrap', () => {
  const html = fs.readFileSync(sidebarPath, 'utf8');
  const scripts = scriptSources(html);
  const customRules = scripts.indexOf('../lib/custom-rules.js');
  const domainProfiles = scripts.indexOf('../lib/domain-profiles.js');
  const imagesNetwork = scripts.indexOf('sidebar-images-network.js');
  const imagesRules = scripts.indexOf('sidebar-images-rules.js');
  const rules = scripts.indexOf('sidebar-rules.js');
  const profiles = scripts.indexOf('sidebar-profiles.js');
  const main = scripts.indexOf('sidebar-main.js');
  assert.ok(customRules >= 0);
  assert.ok(domainProfiles > customRules);
  assert.ok(imagesNetwork >= 0);
  assert.ok(imagesRules > imagesNetwork);
  assert.ok(rules > customRules);
  assert.ok(profiles > domainProfiles);
  assert.ok(profiles > rules);
  assert.ok(main > rules);
  assert.ok(main > profiles);
  assert.ok(main > imagesRules);
});

test('Rules and Profiles tabs, panels, and renderAll hooks stay in sync', () => {
  const html = fs.readFileSync(sidebarPath, 'utf8');
  const main = read('src/sidebar/sidebar-main.js');
  assert.match(html, /data-tab="rules"/);
  assert.match(html, /<section id="rules" class="panel"><\/section>/);
  assert.match(main, /\brenderRules\(\);/);
  assert.match(html, /data-tab="profiles"/);
  assert.match(html, /<section id="profiles" class="panel"><\/section>/);
  assert.match(main, /\brenderProfiles\(\);/);
});

test('content script loads CustomRules and DomainProfiles before content bootstrap', () => {
  const manifest = JSON.parse(read('src/manifest.json'));
  const scripts = manifest.content_scripts[0].js;
  const rules = scripts.indexOf('lib/custom-rules.js');
  const profiles = scripts.indexOf('lib/domain-profiles.js');
  const content = scripts.indexOf('content/content.js');
  assert.ok(rules >= 0);
  assert.ok(profiles > rules);
  assert.ok(content > profiles);
});

test('Profiles source remains public-safe and does not embed configured hostnames', () => {
  const source = read('src/sidebar/sidebar-profiles.js');
  const model = read('src/lib/domain-profiles.js');
  assert.doesNotMatch(source, /profiles\s*:\s*\{\s*["'][^"']+\.[^"']+["']\s*:/);
  assert.doesNotMatch(model, /profiles\s*:\s*\{\s*["'][^"']+\.[^"']+["']\s*:/);
});
