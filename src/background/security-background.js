'use strict';

const SECURITY_RESPONSE_KEY_PREFIX = 'security-response-meta:';
const SECURITY_HEADERS = new Set([
  'content-security-policy',
  'content-security-policy-report-only',
  'strict-transport-security',
  'x-frame-options',
  'referrer-policy',
  'permissions-policy',
  'x-content-type-options',
]);

function collectSecurityHeaders(headers) {
  const output = {};
  for (const header of headers || []) {
    const name = String(header && header.name || '').toLowerCase();
    if (!SECURITY_HEADERS.has(name)) continue;
    if (!output[name]) output[name] = [];
    output[name].push(String(header && header.value || ''));
  }
  return output;
}

browser.webRequest.onHeadersReceived.addListener(
  (details) => {
    if (details.tabId < 0 || details.type !== 'main_frame') return;
    const headers = collectSecurityHeaders(details.responseHeaders);
    const value = {
      url: details.url,
      statusCode: details.statusCode,
      contentSecurityPolicy: headers['content-security-policy'] || [],
      contentSecurityPolicyReportOnly: headers['content-security-policy-report-only'] || [],
      strictTransportSecurity: headers['strict-transport-security'] || [],
      xFrameOptions: headers['x-frame-options'] || [],
      referrerPolicy: headers['referrer-policy'] || [],
      permissionsPolicy: headers['permissions-policy'] || [],
      xContentTypeOptions: headers['x-content-type-options'] || [],
      capturedAt: Date.now(),
    };
    browser.storage.session.set({ [`${SECURITY_RESPONSE_KEY_PREFIX}${details.tabId}`]: value }).catch(() => {});
  },
  { urls: ['http://*/*', 'https://*/*'], types: ['main_frame'] },
  ['responseHeaders'],
);

browser.tabs.onRemoved.addListener((tabId) => {
  browser.storage.session.remove(`${SECURITY_RESPONSE_KEY_PREFIX}${tabId}`).catch(() => {});
});

browser.runtime.onMessage.addListener((message, sender) => {
  if (!message || message.type !== 'seoInspector.getSecurityResponseMeta') return undefined;
  const tabId = sender && sender.tab ? sender.tab.id : null;
  if (typeof tabId !== 'number') return Promise.resolve(null);
  const key = `${SECURITY_RESPONSE_KEY_PREFIX}${tabId}`;
  return browser.storage.session.get(key).then((stored) => stored[key] || null);
});
