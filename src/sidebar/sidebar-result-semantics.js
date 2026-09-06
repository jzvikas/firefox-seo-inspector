'use strict';

(function initResultSemantics() {
  if (typeof document === 'undefined') return;

  const ADVISORY_PATTERN = /\b(actionable|advisory|hint|recommendation|opportunit(?:y|ies))\b/i;

  function resultLabel(text) {
    const label = document.createElement('span');
    label.className = 'result-kind-label';
    label.textContent = text;
    return label;
  }

  function setKind(node, kind, labelText) {
    if (!node || node.dataset.resultKind) return;
    node.dataset.resultKind = kind;
    node.setAttribute('role', 'group');
    node.setAttribute('aria-label', labelText);

    if (node.classList.contains('issue')) {
      node.insertBefore(resultLabel(labelText), node.firstChild);
      return;
    }

    const header = node.querySelector(':scope > .card-header');
    if (header && !header.querySelector('.result-kind-label')) header.appendChild(resultLabel(labelText));
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
    setKind(node, 'fact', 'Observed');
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
