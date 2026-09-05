(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SecurityAudit = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const MIXED_SAMPLE_LIMIT = 50;

  function firstHeader(meta, key) {
    const values = meta && Array.isArray(meta[key]) ? meta[key] : [];
    return values.length ? String(values[0] || '').trim() : '';
  }

  function normalizeUrl(value, baseUrl) {
    try {
      const url = new URL(value, baseUrl || undefined);
      url.hash = '';
      return url.href;
    } catch (_error) {
      return '';
    }
  }

  function isHttps(value) {
    try { return new URL(value).protocol === 'https:'; }
    catch (_error) { return false; }
  }

  function isHttp(value) {
    try { return new URL(value).protocol === 'http:'; }
    catch (_error) { return false; }
  }

  function parseHsts(value) {
    const text = String(value || '');
    const parts = text.split(';').map((item) => item.trim()).filter(Boolean);
    let maxAge = null;
    let includeSubDomains = false;
    let preload = false;
    for (const part of parts) {
      const match = part.match(/^max-age\s*=\s*(\d+)$/i);
      if (match) maxAge = Number(match[1]);
      else if (/^includesubdomains$/i.test(part)) includeSubDomains = true;
      else if (/^preload$/i.test(part)) preload = true;
    }
    return { value: text, maxAge, includeSubDomains, preload };
  }

  function parseCsp(value) {
    const directives = {};
    String(value || '').split(';').forEach((chunk) => {
      const tokens = chunk.trim().split(/\s+/).filter(Boolean);
      if (!tokens.length) return;
      directives[tokens[0].toLowerCase()] = tokens.slice(1);
    });
    return directives;
  }

  function hasFrameAncestors(cspValue) {
    return Object.prototype.hasOwnProperty.call(parseCsp(cspValue), 'frame-ancestors');
  }

  function cspScriptRisks(cspValue) {
    const directives = parseCsp(cspValue);
    const values = directives['script-src'] || directives['default-src'] || [];
    const risks = [];
    if (values.includes("'unsafe-eval'")) risks.push("'unsafe-eval'");
    if (values.includes('*')) risks.push('*');
    return risks;
  }

  function headerDiagnostic(key, label, value, state, detail, severity) {
    return { key, label, value: value || '', state, detail: detail || '', severity: severity || '' };
  }

  function analyzeHeaders(meta, pageUrl) {
    const https = isHttps(pageUrl);
    const csp = firstHeader(meta, 'contentSecurityPolicy');
    const cspReportOnly = firstHeader(meta, 'contentSecurityPolicyReportOnly');
    const hsts = firstHeader(meta, 'strictTransportSecurity');
    const xfo = firstHeader(meta, 'xFrameOptions');
    const referrer = firstHeader(meta, 'referrerPolicy');
    const permissions = firstHeader(meta, 'permissionsPolicy');
    const xcto = firstHeader(meta, 'xContentTypeOptions');
    const rows = [];
    const issues = [];

    if (csp) {
      const risks = cspScriptRisks(csp);
      rows.push(headerDiagnostic('csp', 'Content-Security-Policy', csp, risks.length ? 'review' : 'present', risks.length ? `Broad script policy token(s): ${risks.join(', ')}` : 'Enforced CSP header is present.', risks.length ? 'warning' : ''));
      if (risks.length) issues.push({ severity: 'warning', code: 'csp-broad-script-policy', message: `CSP allows broad script policy token(s): ${risks.join(', ')}.` });
    } else {
      rows.push(headerDiagnostic('csp', 'Content-Security-Policy', '', 'missing', cspReportOnly ? 'Only Content-Security-Policy-Report-Only is present; it does not enforce policy.' : 'No enforced CSP header was observed.', 'warning'));
      issues.push({ severity: 'warning', code: 'missing-csp', message: cspReportOnly ? 'Only a report-only CSP was observed; no enforced CSP header is present.' : 'No enforced Content-Security-Policy header was observed.' });
    }

    if (!https) {
      rows.push(headerDiagnostic('hsts', 'Strict-Transport-Security', hsts, 'not-applicable', 'HSTS is only effective over HTTPS.', ''));
    } else if (!hsts) {
      rows.push(headerDiagnostic('hsts', 'Strict-Transport-Security', '', 'missing', 'No HSTS header was observed on this HTTPS response.', 'warning'));
      issues.push({ severity: 'warning', code: 'missing-hsts', message: 'HTTPS is used but Strict-Transport-Security is missing.' });
    } else {
      const parsed = parseHsts(hsts);
      const weak = parsed.maxAge === null || parsed.maxAge === 0;
      rows.push(headerDiagnostic('hsts', 'Strict-Transport-Security', hsts, weak ? 'review' : 'present', weak ? 'HSTS max-age is missing or zero.' : `max-age=${parsed.maxAge}${parsed.includeSubDomains ? ' · includeSubDomains' : ''}${parsed.preload ? ' · preload' : ''}`, weak ? 'warning' : ''));
      if (weak) issues.push({ severity: 'warning', code: 'weak-hsts', message: 'Strict-Transport-Security has no positive max-age.' });
    }

    if (xfo) {
      const normalized = xfo.toLowerCase();
      const known = normalized === 'deny' || normalized === 'sameorigin';
      rows.push(headerDiagnostic('xfo', 'X-Frame-Options', xfo, known ? 'present' : 'review', known ? 'Legacy frame protection is present.' : 'Unexpected X-Frame-Options value; review manually.', known ? '' : 'warning'));
      if (!known) issues.push({ severity: 'warning', code: 'invalid-x-frame-options', message: `Unexpected X-Frame-Options value: ${xfo}.` });
    } else if (csp && hasFrameAncestors(csp)) {
      rows.push(headerDiagnostic('xfo', 'X-Frame-Options', '', 'covered', 'CSP frame-ancestors is present, so modern framing protection is defined without X-Frame-Options.', ''));
    } else {
      rows.push(headerDiagnostic('xfo', 'X-Frame-Options', '', 'missing', 'Neither X-Frame-Options nor CSP frame-ancestors was observed.', 'warning'));
      issues.push({ severity: 'warning', code: 'missing-frame-protection', message: 'No X-Frame-Options or CSP frame-ancestors framing restriction was observed.' });
    }

    if (!referrer) {
      rows.push(headerDiagnostic('referrer', 'Referrer-Policy', '', 'missing', 'No Referrer-Policy header was observed.', 'warning'));
      issues.push({ severity: 'warning', code: 'missing-referrer-policy', message: 'Referrer-Policy is missing.' });
    } else {
      const unsafe = referrer.toLowerCase().split(',').map((item) => item.trim()).includes('unsafe-url');
      rows.push(headerDiagnostic('referrer', 'Referrer-Policy', referrer, unsafe ? 'review' : 'present', unsafe ? 'unsafe-url may disclose full URLs cross-origin.' : 'Referrer policy is declared.', unsafe ? 'warning' : ''));
      if (unsafe) issues.push({ severity: 'warning', code: 'unsafe-referrer-policy', message: 'Referrer-Policy includes unsafe-url.' });
    }

    if (!permissions) rows.push(headerDiagnostic('permissions', 'Permissions-Policy', '', 'missing', 'No Permissions-Policy header was observed.', 'info'));
    else rows.push(headerDiagnostic('permissions', 'Permissions-Policy', permissions, 'present', 'Permissions policy is declared.', ''));

    if (!xcto) {
      rows.push(headerDiagnostic('xcto', 'X-Content-Type-Options', '', 'missing', 'Expected nosniff was not observed.', 'warning'));
      issues.push({ severity: 'warning', code: 'missing-nosniff', message: 'X-Content-Type-Options: nosniff is missing.' });
    } else if (xcto.toLowerCase() !== 'nosniff') {
      rows.push(headerDiagnostic('xcto', 'X-Content-Type-Options', xcto, 'review', 'Expected value is nosniff.', 'warning'));
      issues.push({ severity: 'warning', code: 'invalid-nosniff', message: `X-Content-Type-Options value is “${xcto}” instead of nosniff.` });
    } else rows.push(headerDiagnostic('xcto', 'X-Content-Type-Options', xcto, 'present', 'MIME sniffing protection is declared.', ''));

    return {
      rows,
      issues,
      reportOnlyCsp: cspReportOnly,
      permissionsPolicy: permissions,
    };
  }

  function candidate(url, kind, source, active, baseUrl) {
    const normalized = normalizeUrl(url, baseUrl);
    if (!normalized) return null;
    return { url: normalized, kind: kind || 'other', source: source || 'dom', active: Boolean(active) };
  }

  function srcsetUrls(value) {
    return String(value || '').split(',').map((part) => part.trim().split(/\s+/)[0]).filter(Boolean);
  }

  function attr(node, name) {
    if (!node || typeof node.getAttribute !== 'function') return '';
    return node.getAttribute(name) || '';
  }

  function domResourceCandidates(doc, pageUrl) {
    if (!doc || typeof doc.querySelectorAll !== 'function') return [];
    const specs = [
      ['script[src]', 'src', 'javascript', true],
      ['link[rel~="stylesheet"][href]', 'href', 'css', true],
      ['iframe[src]', 'src', 'iframe', true],
      ['object[data]', 'data', 'object', true],
      ['embed[src]', 'src', 'embed', true],
      ['form[action]', 'action', 'form', true],
      ['img[src]', 'src', 'image', false],
      ['audio[src]', 'src', 'media', false],
      ['video[src]', 'src', 'media', false],
      ['source[src]', 'src', 'media', false],
    ];
    const output = [];
    for (const spec of specs) {
      const nodes = Array.prototype.slice.call(doc.querySelectorAll(spec[0]) || []);
      nodes.forEach((node) => {
        const item = candidate(attr(node, spec[1]), spec[2], 'dom', spec[3], pageUrl);
        if (item) output.push(item);
      });
    }
    const srcsetNodes = Array.prototype.slice.call(doc.querySelectorAll('img[srcset], source[srcset]') || []);
    srcsetNodes.forEach((node) => srcsetUrls(attr(node, 'srcset')).forEach((url) => {
      const item = candidate(url, 'image', 'srcset', false, pageUrl);
      if (item) output.push(item);
    }));
    return output;
  }

  function performanceCandidates(performanceReport, pageUrl) {
    const resources = performanceReport && Array.isArray(performanceReport.resources) ? performanceReport.resources : [];
    return resources.map((item) => {
      const kind = String(item && item.kind || 'other');
      const passive = kind === 'image' || kind === 'media';
      return candidate(item && item.url || '', kind, 'resource-timing', !passive, pageUrl);
    }).filter(Boolean);
  }

  function analyzeMixedResources(pageUrl, candidates) {
    const pageHttps = isHttps(pageUrl);
    const seen = new Set();
    const mixed = [];
    for (const item of Array.isArray(candidates) ? candidates : []) {
      if (!item || !item.url || !isHttp(item.url)) continue;
      const key = `${item.url}|${item.kind}`;
      if (seen.has(key)) continue;
      seen.add(key);
      if (pageHttps) mixed.push(item);
    }
    mixed.sort((a, b) => Number(b.active) - Number(a.active) || a.url.localeCompare(b.url));
    const active = mixed.filter((item) => item.active).length;
    const passive = mixed.length - active;
    return { pageHttps, total: mixed.length, active, passive, items: mixed.slice(0, MIXED_SAMPLE_LIMIT), capped: mixed.length > MIXED_SAMPLE_LIMIT };
  }

  function thirdPartyScripts(assetAudit) {
    const scripts = assetAudit && Array.isArray(assetAudit.scripts) ? assetAudit.scripts : [];
    const items = scripts.filter((item) => item && item.external && item.thirdParty);
    const hosts = Array.from(new Set(items.map((item) => item.host).filter(Boolean))).sort();
    return { count: items.length, hosts, sample: items.slice(0, 20).map((item) => ({ host: item.host || '', url: item.url || '' })) };
  }

  function collect(doc, options) {
    const opts = options || {};
    const pageUrl = String(opts.pageUrl || '');
    const transportHttps = isHttps(pageUrl);
    const candidates = domResourceCandidates(doc, pageUrl).concat(performanceCandidates(opts.performance, pageUrl));
    const mixed = analyzeMixedResources(pageUrl, candidates);
    const headerData = analyzeHeaders(opts.responseMeta || null, pageUrl);
    const scripts = thirdPartyScripts(opts.assetAudit || null);
    const issues = headerData.issues.slice();

    if (!transportHttps) issues.unshift({ severity: 'critical', code: 'page-not-https', message: 'The inspected page is not using HTTPS.' });
    if (mixed.active) issues.unshift({ severity: 'critical', code: 'active-mixed-content', message: `${mixed.active} active HTTP resource${mixed.active === 1 ? '' : 's'} referenced from an HTTPS page.` });
    if (mixed.passive) issues.push({ severity: 'warning', code: 'passive-mixed-content', message: `${mixed.passive} passive HTTP resource${mixed.passive === 1 ? '' : 's'} referenced from an HTTPS page.` });

    return {
      transport: { https: transportHttps, protocol: (() => { try { return new URL(pageUrl).protocol; } catch (_error) { return ''; } })() },
      mixed,
      headers: headerData.rows,
      reportOnlyCsp: headerData.reportOnlyCsp,
      thirdPartyScripts: scripts,
      issues,
    };
  }

  return {
    MIXED_SAMPLE_LIMIT,
    firstHeader,
    normalizeUrl,
    isHttps,
    isHttp,
    parseHsts,
    parseCsp,
    hasFrameAncestors,
    cspScriptRisks,
    analyzeHeaders,
    candidate,
    srcsetUrls,
    domResourceCandidates,
    performanceCandidates,
    analyzeMixedResources,
    thirdPartyScripts,
    collect,
  };
});
