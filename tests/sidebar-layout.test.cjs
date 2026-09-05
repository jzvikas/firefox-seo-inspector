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

test('every sidebar script reference exists on disk', () => {
  const html = fs.readFileSync(sidebarPath, 'utf8');
  for (const src of scriptSources(html)) {
    const absolute = path.resolve(path.dirname(sidebarPath), src);
    assert.equal(fs.existsSync(absolute), true, `Missing sidebar script: ${src}`);
  }
});

test('custom rules dependencies load before their renderers and main bootstrap', () => {
  const html = fs.readFileSync(sidebarPath, 'utf8');
  const scripts = scriptSources(html);
  const customRules = scripts.indexOf('../lib/custom-rules.js');
  const imagesNetwork = scripts.indexOf('sidebar-images-network.js');
  const imagesRules = scripts.indexOf('sidebar-images-rules.js');
  const rules = scripts.indexOf('sidebar-rules.js');
  const main = scripts.indexOf('sidebar-main.js');
  assert.ok(customRules >= 0);
  assert.ok(imagesNetwork >= 0);
  assert.ok(imagesRules > imagesNetwork);
  assert.ok(rules > customRules);
  assert.ok(main > rules);
  assert.ok(main > imagesRules);
});

test('Rules tab, panel, and renderAll hook stay in sync', () => {
  const html = fs.readFileSync(sidebarPath, 'utf8');
  const main = read('src/sidebar/sidebar-main.js');
  assert.match(html, /data-tab="rules"/);
  assert.match(html, /<section id="rules" class="panel"><\/section>/);
  assert.match(main, /\brenderRules\(\);/);
});

test('content script loads CustomRules before content bootstrap', () => {
  const manifest = JSON.parse(read('src/manifest.json'));
  const scripts = manifest.content_scripts[0].js;
  const rules = scripts.indexOf('lib/custom-rules.js');
  const content = scripts.indexOf('content/content.js');
  assert.ok(rules >= 0);
  assert.ok(content > rules);
});
