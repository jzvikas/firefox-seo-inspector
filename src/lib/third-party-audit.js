(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.ThirdPartyAudit = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const SAMPLE_URL_LIMIT = 5;

  const CATEGORY_RULES = [
    {
      category: 'tag-manager',
      label: 'Tag manager',
      domains: ['googletagmanager.com', 'tealiumiq.com', 'tagcommander.com'],
    },
    {
      category: 'analytics',
      label: 'Analytics',
      domains: ['google-analytics.com', 'analytics.google.com', 'hotjar.com', 'clarity.ms', 'segment.com', 'segment.io', 'amplitude.com', 'mixpanel.com', 'matomo.cloud', 'plausible.io'],
    },
    {
      category: 'ad',
      label: 'Advertising',
      domains: ['doubleclick.net', 'googlesyndication.com', 'adnxs.com', 'criteo.com', 'criteo.net'],
    },
    {
      category: 'widget',
      label: 'Widget / support',
      domains: ['intercom.io', 'intercomcdn.com', 'crisp.chat', 'zendesk.com', 'zdassets.com', 'tawk.to', 'drift.com'],
    },
    {
      category: 'cdn',
      label: 'CDN',
      domains: ['jsdelivr.net', 'cdnjs.cloudflare.com', 'unpkg.com', 'cloudfront.net', 'fastly.net', 'akamaized.net', 'akamaihd.net'],
    },
  ];

  function hostOf(value) {
    try { return new URL(value).hostname.toLowerCase(); }
    catch (_error) { return ''; }
  }

  function matchesDomain(host, domain) {
    const value = String(host || '').toLowerCase();
    const target = String(domain || '').toLowerCase();
    return Boolean(value && target && (value === target || value.endsWith(`.${target}`)));
  }

  function classifyHost(host) {
    const value = String(host || '').toLowerCase();
    for (const rule of CATEGORY_RULES) {
      if (rule.domains.some((domain) => matchesDomain(value, domain))) {
        return { category: rule.category, label: rule.label, confidence: 'known-domain' };
      }
    }
    if (value.startsWith('cdn.') || value.includes('.cdn.')) {
      return { category: 'cdn', label: 'CDN', confidence: 'hostname-heuristic' };
    }
    return { category: 'other', label: 'Other third-party', confidence: 'unclassified' };
  }

  function emptyGroup(host) {
    const classification = classifyHost(host);
    return {
      host,
      category: classification.category,
      categoryLabel: classification.label,
      classificationConfidence: classification.confidence,
      requestCount: 0,
      knownBytes: 0,
      knownSizeCount: 0,
      totalDuration: 0,
      typeCounts: {},
      sampleUrls: [],
    };
  }

  function addResource(group, resource) {
    group.requestCount += 1;
    const sizeBytes = Math.max(0, Number(resource && resource.sizeBytes) || 0);
    if (sizeBytes > 0) {
      group.knownBytes += sizeBytes;
      group.knownSizeCount += 1;
    }
    group.totalDuration += Math.max(0, Number(resource && resource.duration) || 0);
    const kind = String(resource && resource.kind || 'other');
    group.typeCounts[kind] = (group.typeCounts[kind] || 0) + 1;
    const url = resource && resource.url ? String(resource.url) : '';
    if (url && group.sampleUrls.length < SAMPLE_URL_LIMIT && !group.sampleUrls.includes(url)) group.sampleUrls.push(url);
    return group;
  }

  function groupResources(performanceReport) {
    const resources = performanceReport && Array.isArray(performanceReport.resources) ? performanceReport.resources : [];
    const groups = new Map();

    resources.forEach((resource) => {
      if (!resource || !resource.thirdParty || !resource.url) return;
      const host = hostOf(resource.url);
      if (!host) return;
      if (!groups.has(host)) groups.set(host, emptyGroup(host));
      addResource(groups.get(host), resource);
    });

    return Array.from(groups.values()).sort((a, b) => {
      if (b.knownBytes !== a.knownBytes) return b.knownBytes - a.knownBytes;
      if (b.requestCount !== a.requestCount) return b.requestCount - a.requestCount;
      return a.host.localeCompare(b.host);
    });
  }

  function categorySummary(groups) {
    const summary = {};
    (Array.isArray(groups) ? groups : []).forEach((group) => {
      const key = group.category || 'other';
      if (!summary[key]) summary[key] = { category: key, label: group.categoryLabel || key, domains: 0, requests: 0, knownBytes: 0, knownSizeCount: 0 };
      summary[key].domains += 1;
      summary[key].requests += Number(group.requestCount) || 0;
      summary[key].knownBytes += Number(group.knownBytes) || 0;
      summary[key].knownSizeCount += Number(group.knownSizeCount) || 0;
    });
    return Object.values(summary).sort((a, b) => b.knownBytes - a.knownBytes || b.requests - a.requests || a.label.localeCompare(b.label));
  }

  function summarize(groups) {
    const items = Array.isArray(groups) ? groups : [];
    return items.reduce((summary, group) => {
      summary.domainCount += 1;
      summary.requestCount += Number(group.requestCount) || 0;
      summary.knownBytes += Number(group.knownBytes) || 0;
      summary.knownSizeCount += Number(group.knownSizeCount) || 0;
      summary.totalDuration += Number(group.totalDuration) || 0;
      return summary;
    }, { domainCount: 0, requestCount: 0, knownBytes: 0, knownSizeCount: 0, totalDuration: 0 });
  }

  function collect(performanceReport) {
    const groups = groupResources(performanceReport);
    return {
      summary: summarize(groups),
      categories: categorySummary(groups),
      groups,
      classificationNote: 'Categories are local heuristics based on a small built-in list of common public service domains and generic CDN host naming. Unmatched hosts remain unclassified.',
    };
  }

  return {
    SAMPLE_URL_LIMIT,
    CATEGORY_RULES,
    hostOf,
    matchesDomain,
    classifyHost,
    emptyGroup,
    addResource,
    groupResources,
    categorySummary,
    summarize,
    collect,
  };
});
