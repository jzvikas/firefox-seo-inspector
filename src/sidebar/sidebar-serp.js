'use strict';

const serpState = {
  device: 'desktop',
};

function serpMetricRow(container, label, metrics, suffix) {
  const value = metrics.missing
    ? 'Missing'
    : `${metrics.widthPx}px${suffix || ''}${metrics.truncated ? ` · overflow +${metrics.overflowPx}px` : ' · fits'}`;
  addRow(container, label, value, metrics.truncated || metrics.missing ? 'serp-metric-bad' : 'serp-metric-good');
}

function renderSerpPreviewCard(analysis) {
  const cardNode = el('div', 'card');
  const header = el('div', 'card-header', 'Search result preview');
  header.appendChild(document.createTextNode(' '));
  header.appendChild(badge(analysis.device === 'mobile' ? 'Mobile' : 'Desktop', 'ok'));
  cardNode.appendChild(header);

  const preview = el('div', `serp-preview ${analysis.device}`);
  preview.appendChild(el('div', 'serp-site', analysis.url.breadcrumb || analysis.url.host || 'example.com'));

  const title = el('div', 'serp-title', analysis.title.text || 'Page title is missing');
  if (analysis.title.truncated) title.classList.add('serp-truncated');
  preview.appendChild(title);

  const description = el('div', 'serp-description', analysis.description.text || 'Meta description is missing.');
  if (analysis.description.truncated) description.classList.add('serp-truncated');
  preview.appendChild(description);
  cardNode.appendChild(preview);

  return cardNode;
}

function renderSerp() {
  const panel = document.getElementById('serp');
  clear(panel);
  if (!state.report) return panel.appendChild(el('div', 'empty', 'No audit data.'));

  const facts = state.report.facts;
  const canonical = facts.canonical && facts.canonical.href ? facts.canonical.href : '';
  const analysis = SerpPreview.analyze({
    title: facts.title,
    description: facts.description,
    url: facts.url || canonical,
    canonical,
  }, serpState.device);

  const toolbar = el('div', 'toolbar');
  for (const device of ['desktop', 'mobile']) {
    const button = el('button', '', device === 'desktop' ? 'Desktop' : 'Mobile');
    button.type = 'button';
    button.disabled = serpState.device === device;
    button.addEventListener('click', () => {
      serpState.device = device;
      renderSerp();
    });
    toolbar.appendChild(button);
  }
  panel.appendChild(toolbar);
  panel.appendChild(renderSerpPreviewCard(analysis));

  const metrics = el('div', 'card');
  metrics.appendChild(el('div', 'card-header', 'Estimated snippet width'));
  serpMetricRow(metrics, 'Title', analysis.title, ` / ${analysis.title.maxPx}px`);
  addRow(metrics, 'Title characters', analysis.title.chars);
  serpMetricRow(metrics, 'Description', analysis.description, ` / ${analysis.description.capacityPx}px total`);
  addRow(metrics, 'Description characters', analysis.description.chars);
  addRow(metrics, 'Estimated lines', `${analysis.description.estimatedLines} / ${analysis.description.lines}`);
  addRow(metrics, 'Device profile', analysis.device === 'mobile' ? 'Mobile' : 'Desktop');
  panel.appendChild(metrics);

  const warnings = el('div', 'card');
  warnings.appendChild(el('div', 'card-header', 'Preview warnings'));
  if (!analysis.warnings.length) warnings.appendChild(el('div', 'empty', 'No estimated truncation problems detected.'));
  else analysis.warnings.forEach((item) => {
    const node = el('div', 'issue warning');
    node.appendChild(el('div', 'issue-title', item.label));
    warnings.appendChild(node);
  });
  panel.appendChild(warnings);

  const note = el('div', 'card');
  note.appendChild(el('div', 'card-header', 'About this preview'));
  note.appendChild(el('div', 'serp-note', 'Pixel widths are local estimates for fast diagnostics. Search engines can rewrite titles/descriptions and vary snippet layout by query, device, language, and experiment.'));
  panel.appendChild(note);
}
