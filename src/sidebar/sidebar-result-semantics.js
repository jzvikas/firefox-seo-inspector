'use strict';

(function initResultSemantics() {
  if (typeof document === 'undefined') return;

  const ADVISORY_PATTERN = /\b(actionable|advisory|hint|recommendation|opportunit(?:y|ies))\b/i;

  function setKind(node, kind, label) {
    if (!node || node.dataset.resultKind) return;
    node.dataset.resultKind = kind;
    node.setAttribute('aria-label', `${label}: ${node.getAttribute('aria-label') || node.textContent || ''}`.trim());
  }

  function classifyIssue(node) {
    const severity = node.classList.contains('critical') ? 'critical' : 'warning';
    setKind(node, 'warning', severity === 'critical' ? 'Critical rule failure' : 'Rule warning');
  }

  function classifyCard(node) {
    if (node.querySelector('.issue[data-result-kind="warning"], .issue.critical, .issue.warning')) return;
    const header = node.querySelector(':scope > .card-header');
    const title = header ? String(header.textContent || '') : '';
    if (ADVISORY_PATTERN.test(title)) {
      setKind(node, 'recommendation', 'Recommendation');
      return;
    }
    setKind(node, 'fact', 'Observed page facts');
  }

  function annotate(root) {
    const scope = root && root.querySelectorAll ? root : document;
    if (scope.matches && scope.matches('.issue')) classifyIssue(scope);
    scope.querySelectorAll('.issue').forEach(classifyIssue);
    if (scope.matches && scope.matches('.card')) classifyCard(scope);
    scope.querySelectorAll('.card').forEach(classifyCard);
  }

  annotate(document);

  if (typeof MutationObserver === 'function') {
    const observer = new MutationObserver((records) => {
      records.forEach((record) => {
        record.addedNodes.forEach((node) => {
          if (node && node.nodeType === 1) annotate(node);
        });
      });
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }
})();
