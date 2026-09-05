(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.RobotsTxt = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function cleanLine(value) {
    return String(value || '').replace(/\r$/, '').replace(/(^|[^%])#.*/, '$1').trim();
  }

  function parse(text) {
    const groups = [];
    const sitemaps = [];
    const warnings = [];
    let group = null;
    let groupHasRules = false;
    const lines = String(text || '').replace(/^\uFEFF/, '').split(/\n/);

    lines.forEach((rawLine, index) => {
      const lineNumber = index + 1;
      const line = cleanLine(rawLine);
      if (!line) return;
      const colon = line.indexOf(':');
      if (colon < 1) {
        warnings.push({ line: lineNumber, message: 'Directive is missing a colon.' });
        return;
      }
      const field = line.slice(0, colon).trim().toLowerCase();
      const value = line.slice(colon + 1).trim();

      if (field === 'sitemap') {
        if (value) sitemaps.push(value);
        else warnings.push({ line: lineNumber, message: 'Empty Sitemap directive.' });
        return;
      }

      if (field === 'user-agent') {
        if (!value) {
          warnings.push({ line: lineNumber, message: 'Empty User-agent directive.' });
          return;
        }
        if (!group || groupHasRules) {
          group = { agents: [], rules: [] };
          groups.push(group);
          groupHasRules = false;
        }
        group.agents.push(value.toLowerCase());
        return;
      }

      if (field === 'allow' || field === 'disallow') {
        if (!group || !group.agents.length) {
          warnings.push({ line: lineNumber, message: `${field} appears before a User-agent group.` });
          return;
        }
        groupHasRules = true;
        group.rules.push({ type: field, path: value, line: lineNumber });
      }
    });

    return {
      groups,
      sitemaps: Array.from(new Set(sitemaps)),
      warnings,
    };
  }

  function agentSpecificity(agent, crawler) {
    const token = String(agent || '').toLowerCase().trim();
    const product = String(crawler || '').toLowerCase().trim();
    if (!token) return -1;
    if (token === '*') return 0;
    return product.includes(token) ? token.length : -1;
  }

  function matchingGroups(parsed, crawler) {
    const groups = parsed && Array.isArray(parsed.groups) ? parsed.groups : [];
    let best = -1;
    const matches = [];
    for (const group of groups) {
      let groupBest = -1;
      for (const agent of group.agents || []) groupBest = Math.max(groupBest, agentSpecificity(agent, crawler));
      if (groupBest < 0) continue;
      if (groupBest > best) {
        best = groupBest;
        matches.length = 0;
        matches.push(group);
      } else if (groupBest === best) {
        matches.push(group);
      }
    }
    return { groups: matches, specificity: best };
  }

  function targetPath(urlValue) {
    try {
      const url = new URL(urlValue);
      return `${url.pathname || '/'}${url.search || ''}`;
    } catch (_error) {
      return String(urlValue || '/') || '/';
    }
  }

  function regexForRule(path) {
    const source = String(path || '');
    if (!source) return null;
    const anchored = source.endsWith('$');
    const body = anchored ? source.slice(0, -1) : source;
    let escaped = '';
    for (const char of body) {
      if (char === '*') escaped += '.*';
      else escaped += char.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
    return new RegExp(`^${escaped}${anchored ? '$' : ''}`);
  }

  function ruleMatches(rule, path) {
    if (!rule || !rule.path) return false;
    const expression = regexForRule(rule.path);
    return expression ? expression.test(path) : false;
  }

  function ruleWeight(rule) {
    return String((rule && rule.path) || '').replace(/\*/g, '').replace(/\$$/, '').length;
  }

  function evaluate(parsed, urlValue, crawler) {
    const userAgent = crawler || 'Googlebot';
    const selected = matchingGroups(parsed || {}, userAgent);
    const path = targetPath(urlValue);
    const candidates = [];

    for (const group of selected.groups) {
      for (const rule of group.rules || []) {
        if (rule.type === 'disallow' && rule.path === '') continue;
        if (ruleMatches(rule, path)) candidates.push(rule);
      }
    }

    candidates.sort((a, b) => {
      const lengthDiff = ruleWeight(b) - ruleWeight(a);
      if (lengthDiff) return lengthDiff;
      if (a.type === b.type) return a.line - b.line;
      return a.type === 'allow' ? -1 : 1;
    });

    const matchedRule = candidates[0] || null;
    const blocked = Boolean(matchedRule && matchedRule.type === 'disallow');
    const matchedAgents = Array.from(new Set(selected.groups.flatMap((item) => item.agents || [])));

    return {
      userAgent,
      allowed: !blocked,
      blocked,
      path,
      matchedAgents,
      rule: matchedRule ? `${matchedRule.type === 'allow' ? 'Allow' : 'Disallow'}: ${matchedRule.path}` : '',
      ruleType: matchedRule ? matchedRule.type : '',
      ruleLine: matchedRule ? matchedRule.line : null,
      sitemaps: parsed && Array.isArray(parsed.sitemaps) ? parsed.sitemaps.slice() : [],
      warnings: parsed && Array.isArray(parsed.warnings) ? parsed.warnings.slice() : [],
    };
  }

  function resolveSitemaps(values, robotsUrl) {
    const result = [];
    const seen = new Set();
    for (const value of values || []) {
      try {
        const url = new URL(value, robotsUrl).href;
        if (!/^https?:/i.test(url) || seen.has(url)) continue;
        seen.add(url);
        result.push(url);
      } catch (_error) {
        // Invalid sitemap locations are exposed through parser warnings upstream.
      }
    }
    return result;
  }

  return {
    parse,
    evaluate,
    matchingGroups,
    targetPath,
    regexForRule,
    ruleMatches,
    resolveSitemaps,
  };
});
