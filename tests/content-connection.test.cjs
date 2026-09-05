'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const ContentConnection = require('../src/lib/content-connection.js');

function manifest() {
  return {
    content_scripts: [{
      matches: ['http://*/*', 'https://*/*'],
      js: ['lib/a.js', 'lib/b.js', 'content/content.js'],
    }],
  };
}

test('inspectability gives explicit states for HTTP, Firefox pages, local files, and unsupported schemes', () => {
  assert.equal(ContentConnection.inspectability('https://example.test/').supported, true);
  assert.equal(ContentConnection.inspectability('http://example.test/').supported, true);
  assert.equal(ContentConnection.inspectability('about:addons').code, 'browser-page');
  assert.match(ContentConnection.inspectability('about:addons').title, /Firefox page/);
  assert.equal(ContentConnection.inspectability('file:///tmp/test.html').code, 'file-page');
  assert.equal(ContentConnection.inspectability('ftp://example.test/a').code, 'unsupported-scheme');
  assert.equal(ContentConnection.inspectability('').code, 'missing-url');
});

test('contentScriptFiles resolves the declared content bundle without unsafe paths', () => {
  assert.deepEqual(ContentConnection.contentScriptFiles(manifest()), ['lib/a.js', 'lib/b.js', 'content/content.js']);
  assert.deepEqual(ContentConnection.contentScriptFiles({
    content_scripts: [{ js: ['../bad.js', '/absolute.js', 'content/content.js'] }],
  }), ['content/content.js']);
  assert.deepEqual(ContentConnection.contentScriptFiles({ content_scripts: [] }), []);
});

test('ensure leaves a live content script untouched', async () => {
  let injected = 0;
  const browser = {
    tabs: {
      async sendMessage(tabId, message) {
        assert.equal(tabId, 7);
        assert.equal(message.type, 'seoInspector.ping');
        return { ok: true, url: 'https://example.test/' };
      },
    },
    scripting: {
      async executeScript() { injected += 1; },
    },
    runtime: { getManifest: manifest },
  };
  const result = await ContentConnection.ensure(browser, 7, manifest());
  assert.equal(result.ok, true);
  assert.equal(result.recovered, false);
  assert.equal(result.injected, false);
  assert.equal(injected, 0);
});

test('ensure injects the manifest content bundle once when an existing tab lost its extension context', async () => {
  let pings = 0;
  const injections = [];
  const browser = {
    tabs: {
      async sendMessage() {
        pings += 1;
        if (pings === 1) throw new Error('Could not establish connection. Receiving end does not exist.');
        return { ok: true, url: 'https://example.test/' };
      },
    },
    scripting: {
      async executeScript(options) { injections.push(options); },
    },
    runtime: { getManifest: manifest },
  };
  const result = await ContentConnection.ensure(browser, 9, manifest());
  assert.equal(result.ok, true);
  assert.equal(result.recovered, true);
  assert.equal(result.injected, true);
  assert.equal(pings, 2);
  assert.deepEqual(injections, [{
    target: { tabId: 9 },
    files: ['lib/a.js', 'lib/b.js', 'content/content.js'],
  }]);
});

test('ensure reports blocked injection instead of pretending a protected page needs a reload', async () => {
  const browser = {
    tabs: { async sendMessage() { throw new Error('No receiver'); } },
    scripting: { async executeScript() { throw new Error('Missing host permission for https://addons.mozilla.org/example'); } },
    runtime: { getManifest: manifest },
  };
  const result = await ContentConnection.ensure(browser, 3, manifest());
  assert.equal(result.ok, false);
  assert.equal(result.code, 'injection-blocked');
  assert.doesNotMatch(result.error.message, /addons\.mozilla\.org/);
  assert.match(ContentConnection.failureMessage('https://addons.mozilla.org/', result).detail, /did not allow/);
});

test('safeError bounds messages and removes concrete HTTP and extension URLs', () => {
  const info = ContentConnection.safeError(new Error(`boom https://private.example/path moz-extension://abc/sidebar ${'x'.repeat(400)}`));
  assert.equal(info.name, 'Error');
  assert.doesNotMatch(info.message, /private\.example/);
  assert.doesNotMatch(info.message, /moz-extension:\/\/abc/);
  assert.ok(info.message.length <= ContentConnection.MAX_ERROR_LENGTH);
});
