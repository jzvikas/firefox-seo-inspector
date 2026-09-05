'use strict';

const rulesUiState = {
  config: null,
  loading: false,
  message: '',
  error: '',
  schemaStatus: null,
};

let rulesEditorRefs = null;

async function loadRulesUiConfig() {
  if (rulesUiState.loading) return;
  rulesUiState.loading = true;
  try {
    rulesUiState.schemaStatus = await ensureStorageSchemaReady(false);
    const stored = await browser.storage.local.get(CustomRules.STORAGE_KEY);
    rulesUiState.config = CustomRules.normalize(stored && stored[CustomRules.STORAGE_KEY]);
    rulesUiState.error = '';
  } catch (_error) {
    rulesUiState.config = CustomRules.normalize(null);
    rulesUiState.error = 'Could not read saved rules. Defaults are shown.';
  } finally {
    rulesUiState.loading = false;
    renderRules();
  }
}

function activeRulesConfig() {
  if (rulesUiState.config) return CustomRules.normalize(rulesUiState.config);
  if (state.report && state.report.customRules) return CustomRules.normalize(state.report.customRules);
  return CustomRules.normalize(null);
}

function rulesField(label, input, help) {
  const row = el('div', 'rules-field');
  const labelNode = el('label', 'rules-label', label);
  labelNode.appendChild(input);
  row.appendChild(labelNode);
  if (help) row.appendChild(el('div', 'muted rules-help', help));
  return row;
}

function rulesNumberInput(value, min, max, step) {
  const input = document.createElement('input');
  input.type = 'number';
  input.value = String(value);
  input.min = String(min);
  input.max = String(max);
  input.step = String(step || 1);
  return input;
}

function rulesCheckbox(checked) {
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.checked = Boolean(checked);
  return input;
}

function rulesSeveritySelect(current, fallback) {
  const select = document.createElement('select');
  const values = [
    ['', `Default (${fallback})`],
    ['critical', 'Critical'],
    ['warning', 'Warning'],
    ['info', 'Info'],
  ];
  values.forEach(([value, label]) => {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = label;
    option.selected = current === value;
    select.appendChild(option);
  });
  return select;
}

function buildRulesEditor(config) {
  const refs = { thresholds: {}, required: {}, checks: [] };

  const thresholds = el('div', 'card');
  thresholds.appendChild(el('div', 'card-header', 'Thresholds'));
  const thresholdFields = [
    ['titleMin', 'Title minimum', config.thresholds.titleMin, 0, 500, 1, 'Characters.'],
    ['titleMax', 'Title maximum', config.thresholds.titleMax, 1, 500, 1, 'Characters.'],
    ['descriptionMin', 'Description minimum', config.thresholds.descriptionMin, 0, 2000, 1, 'Characters.'],
    ['descriptionMax', 'Description maximum', config.thresholds.descriptionMax, 1, 2000, 1, 'Characters.'],
    ['oversizedImageRatio', 'Oversized image ratio', config.thresholds.oversizedImageRatio, 1, 20, 0.1, 'Intrinsic width divided by rendered width.'],
    ['imageMaxKiB', 'Image file-size limit', Math.round(config.thresholds.imageMaxBytes / 1024), 1, 102400, 1, 'KiB. Applied only after Check image network knows a real size.'],
  ];
  thresholdFields.forEach(([key, label, value, min, max, step, help]) => {
    const input = rulesNumberInput(value, min, max, step);
    refs.thresholds[key] = input;
    thresholds.appendChild(rulesField(label, input, help));
  });

  const required = el('div', 'card');
  required.appendChild(el('div', 'card-header', 'Required signals'));
  const requiredFields = [
    ['title', 'Title'],
    ['description', 'Meta description'],
    ['canonical', 'Canonical'],
    ['h1', 'H1'],
    ['schema', 'Typed structured data'],
    ['hreflang', 'Hreflang'],
    ['https', 'HTTPS'],
  ];
  requiredFields.forEach(([key, label]) => {
    const input = rulesCheckbox(config.required[key]);
    refs.required[key] = input;
    required.appendChild(rulesField(label, input));
  });

  const checks = el('div', 'card');
  checks.appendChild(el('div', 'card-header', 'Checks and severity'));
  checks.appendChild(el('div', 'muted rules-help', 'Disable individual findings or override their severity. Required-signal toggles above control only the corresponding missing-signal finding.'));
  const disabled = new Set(config.disabledChecks);
  CustomRules.CHECKS.forEach((definition) => {
    const row = el('div', 'rules-check-row');
    const enabled = rulesCheckbox(!disabled.has(definition.id));
    const label = el('label', 'rules-check-label');
    label.appendChild(enabled);
    const copy = el('span', '');
    copy.appendChild(el('span', '', definition.label));
    copy.appendChild(el('span', 'muted rules-check-id', `${definition.category} · ${definition.id}`));
    label.appendChild(copy);
    row.appendChild(label);
    const severity = rulesSeveritySelect(config.severityOverrides[definition.id] || '', definition.severity);
    row.appendChild(severity);
    checks.appendChild(row);
    refs.checks.push({ definition, enabled, severity });
  });

  return { refs, nodes: [thresholds, required, checks] };
}

function readRulesEditor() {
  if (!rulesEditorRefs) return CustomRules.normalize(null);
  const t = rulesEditorRefs.thresholds;
  const required = {};
  Object.entries(rulesEditorRefs.required).forEach(([key, input]) => { required[key] = input.checked; });
  const disabledChecks = [];
  const severityOverrides = {};
  rulesEditorRefs.checks.forEach(({ definition, enabled, severity }) => {
    if (!enabled.checked) disabledChecks.push(definition.id);
    if (severity.value) severityOverrides[definition.id] = severity.value;
  });
  return {
    version: CustomRules.SCHEMA_VERSION,
    thresholds: {
      titleMin: Number(t.titleMin.value),
      titleMax: Number(t.titleMax.value),
      descriptionMin: Number(t.descriptionMin.value),
      descriptionMax: Number(t.descriptionMax.value),
      oversizedImageRatio: Number(t.oversizedImageRatio.value),
      imageMaxBytes: Number(t.imageMaxKiB.value) * 1024,
    },
    required,
    disabledChecks,
    severityOverrides,
  };
}

async function saveRulesFromEditor() {
  const raw = readRulesEditor();
  const errors = CustomRules.validate(raw);
  if (errors.length) {
    rulesUiState.error = errors.join(' ');
    rulesUiState.message = '';
    renderRules();
    return;
  }
  const config = CustomRules.normalize(raw);
  try {
    rulesUiState.schemaStatus = await requireWritableStorageSchema();
    await browser.storage.local.set({ [CustomRules.STORAGE_KEY]: config });
    rulesUiState.config = config;
    rulesUiState.error = '';
    rulesUiState.message = 'Rules saved locally. Re-running the audit…';
    renderRules();
    await refresh();
  } catch (error) {
    rulesUiState.error = storageSchemaReadOnlyMessage(rulesUiState.schemaStatus) || (error && error.message) || 'Could not save custom rules.';
    rulesUiState.message = '';
    renderRules();
  }
}

async function resetRulesToDefaults() {
  try {
    rulesUiState.schemaStatus = await requireWritableStorageSchema();
    await browser.storage.local.remove(CustomRules.STORAGE_KEY);
    rulesUiState.config = CustomRules.normalize(null);
    rulesUiState.error = '';
    rulesUiState.message = 'Defaults restored. Re-running the audit…';
    renderRules();
    await refresh();
  } catch (error) {
    rulesUiState.error = storageSchemaReadOnlyMessage(rulesUiState.schemaStatus) || (error && error.message) || 'Could not reset custom rules.';
    renderRules();
  }
}

function renderRules() {
  const panel = document.getElementById('rules');
  if (!panel) return;
  clear(panel);

  if (!rulesUiState.config && !rulesUiState.loading) loadRulesUiConfig().catch(() => {});
  const config = activeRulesConfig();
  const writable = storageSchemaIsWritable();

  const toolbar = el('div', 'toolbar');
  const save = el('button', '', 'Save rules');
  save.type = 'button';
  save.disabled = !writable;
  save.addEventListener('click', () => saveRulesFromEditor());
  toolbar.appendChild(save);
  const reset = el('button', '', 'Reset defaults');
  reset.type = 'button';
  reset.disabled = !writable;
  reset.addEventListener('click', () => resetRulesToDefaults());
  toolbar.appendChild(reset);
  toolbar.appendChild(badge(`Rules v${config.version}`, 'ok'));
  panel.appendChild(toolbar);

  const readOnly = storageSchemaReadOnlyMessage(rulesUiState.schemaStatus);
  if (readOnly) panel.appendChild(el('div', 'issue warning', readOnly));
  if (rulesUiState.error && rulesUiState.error !== readOnly) panel.appendChild(el('div', 'issue critical', rulesUiState.error));
  if (rulesUiState.message) panel.appendChild(el('div', 'issue info', rulesUiState.message));

  const intro = el('div', 'card');
  intro.appendChild(el('div', 'card-header', 'Local audit policy'));
  intro.appendChild(el('div', 'serp-note', 'These settings are stored only in Firefox extension storage on this browser. They change findings and score locally; they do not modify the inspected website.'));
  panel.appendChild(intro);

  const editor = buildRulesEditor(config);
  rulesEditorRefs = editor.refs;
  editor.nodes.forEach((node) => panel.appendChild(node));
}
