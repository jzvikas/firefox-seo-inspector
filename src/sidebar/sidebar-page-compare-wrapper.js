'use strict';

const renderCompareWithoutPageComparison = renderCompare;
renderCompare = function renderCompareWithPageComparison() {
  renderCompareWithoutPageComparison();
  const panel = document.getElementById('compare');
  if (!panel || !state.report) return;
  appendPageComparison(panel);
};
