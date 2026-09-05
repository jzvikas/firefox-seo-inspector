(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.ContentConnection = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const PING_TYPE = 'seoInspector.ping';
  const MAX_ERROR_LENGTH = 240;

  function clean(value) {
    return String(value === null || value === undefined ? '' : value).replace(/\s+/g, ' ').trim();
  }

  function safeError(error) {
    const name = clean(error && error.name) || 'Error';
    let message = clean(error && error.message ? error.message : error);
    message = message
      .replace(/moz-extension:\/\/[^\s)]+/gi, 'moz-extension://…')
      .replace(/https?:\/\/[^\s)]+/gi, 'https://…');
    if (message.length > MAX_ERROR_LENGTH) message = `${message.slice(0, MAX_ERROR_LENGTH - 1)}…`;
    return { name, message };
  }

  function inspectability(value) {
    const raw = clean(value);
    if (!raw) {
      return {
        supported: false,
        code: 'missing-url',
        title: 'No inspectable page',
        detail: 'Select a normal HTTP or HTTPS tab and try again.',
      };
    }

    let url;
    try { url = new URL(raw); }
    catch (_error) {
      return {
        supported: false,
        code: 'invalid-url',
        title: 'Unsupported page',
        detail: 'The active tab does not expose a valid HTTP or HTTPS URL.',
      };
    }

    if (url.protocol === 'http:' || url.protocol === 'https:') {
      return { supported: true, code: 'http', title: '', detail: '' };
    }

    const scheme = url.protocol.replace(/:$/, '') || 'unknown';
    const browserSchemes = new Set(['about', 'moz-extension', 'resource', 'chrome', 'view-source']);
    if (browserSchemes.has(scheme)) {
      return {
        supported: false,
        code: 'browser-page',
        title: 'Firefox page cannot be inspected',
        detail: `Firefox does not allow normal page inspection on ${scheme}: pages. Open an HTTP or HTTPS page.`,
      };
    }
    if (scheme === 'file') {
      return {
        supported: false,
        code: 'file-page',
        title: 'Local file is not enabled',
        detail: 'This build only inspects HTTP and HTTPS pages; local file access is intentionally not requested.',
      };
    }
    return {
      supported: false,
      code: 'unsupported-scheme',
      title: 'Unsupported page',
      detail: `The ${scheme}: URL scheme is not supported. Open an HTTP or HTTPS page.`,
    };
  }

  function contentScriptFiles(manifest) {
    const entries = manifest && Array.isArray(manifest.content_scripts) ? manifest.content_scripts : [];
    const entry = entries.find((item) => Array.isArray(item && item.js) && item.js.includes('content/content.js'));
    if (!entry) return [];
    return entry.js
      .map((value) => clean(value))
      .filter((value) => value && !value.startsWith('/') && !value.includes('..'))
      .slice(0, 64);
  }

  async function ping(browserApi, tabId) {
    if (!browserApi || !browserApi.tabs || typeof browserApi.tabs.sendMessage !== 'function' || !Number.isInteger(tabId)) {
      return { ok: false, error: { name: 'ConnectionError', message: 'Tab messaging is unavailable.' } };
    }
    try {
      const response = await browserApi.tabs.sendMessage(tabId, { type: PING_TYPE });
      if (response && response.ok === true) return { ok: true, response };
      return { ok: false, error: { name: 'ConnectionError', message: 'Inspector content script did not acknowledge the ping.' } };
    } catch (error) {
      return { ok: false, error: safeError(error) };
    }
  }

  async function ensure(browserApi, tabId, manifest) {
    const first = await ping(browserApi, tabId);
    if (first.ok) return { ok: true, recovered: false, injected: false, response: first.response };

    if (!browserApi || !browserApi.scripting || typeof browserApi.scripting.executeScript !== 'function') {
      return {
        ok: false,
        recovered: false,
        injected: false,
        code: 'scripting-unavailable',
        error: first.error,
      };
    }

    const files = contentScriptFiles(manifest || (browserApi.runtime && typeof browserApi.runtime.getManifest === 'function' ? browserApi.runtime.getManifest() : null));
    if (!files.length) {
      return {
        ok: false,
        recovered: false,
        injected: false,
        code: 'content-bundle-missing',
        error: { name: 'ConnectionError', message: 'Content-script bundle is not declared in the manifest.' },
      };
    }

    try {
      await browserApi.scripting.executeScript({ target: { tabId }, files });
    } catch (error) {
      return {
        ok: false,
        recovered: false,
        injected: false,
        code: 'injection-blocked',
        error: safeError(error),
      };
    }

    const second = await ping(browserApi, tabId);
    if (!second.ok) {
      return {
        ok: false,
        recovered: false,
        injected: true,
        code: 'no-response-after-injection',
        error: second.error,
      };
    }

    return { ok: true, recovered: true, injected: true, response: second.response };
  }

  function failureMessage(url, result) {
    const access = inspectability(url);
    if (!access.supported) return access;
    const code = result && result.code ? result.code : 'connection-failed';
    if (code === 'injection-blocked') {
      return {
        supported: true,
        code,
        title: 'Page access unavailable',
        detail: 'Firefox did not allow the Inspector content script on this page. Protected browser or restricted site pages may block extension injection.',
      };
    }
    if (code === 'no-response-after-injection') {
      return {
        supported: true,
        code,
        title: 'Page connection failed',
        detail: 'The Inspector tried to reconnect to this tab but the content script did not respond. Wait for the page to finish loading, then use Refresh.',
      };
    }
    return {
      supported: true,
      code,
      title: 'Page connection unavailable',
      detail: 'The Inspector could not connect to this tab. Use Refresh; if the page is protected by Firefox, it cannot be inspected.',
    };
  }

  return {
    PING_TYPE,
    MAX_ERROR_LENGTH,
    safeError,
    inspectability,
    contentScriptFiles,
    ping,
    ensure,
    failureMessage,
  };
});
