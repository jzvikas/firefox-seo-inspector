'use strict';

const profilesUiState = {
  store: null,
  loading: false,
  loaded: false,
  hostname: '',
  message: '',
  error: '',
};

let profileEditorRefs = null;

function profilesCurrentUrl() {
  return state.report && state.report.facts ? String(state.report.facts.url || '') : '';
}

function profilesCurrentHostname() {
  return DomainProfiles.normalizeHostname(profilesCurrentUrl());
}

async function loadProfilesStore() {
  if (profilesUiState.loading) return;
  profilesUiState.loading = true;
  try {
    const stored = await browser.storage.local.get(DomainProfiles.STORAGE_KEY);
    profilesUiState.store = DomainProfiles.normalizeStore(stored && stored[DomainProfiles.STORAGE_KEY]);
    profilesUiState.error = '';
  } catch (_error) {
    profilesUiState.store = DomainProfiles.normalizeStore(null);
    profilesUiState.error = 'Could not read saved domain profiles.';
  } finally {
    profilesUiState.loading = false;
    profilesUiState.loaded = true;
    renderProfiles();
  }
}

function profileTextInput(value, placeholder) {
  const input = document.createElement('input');
  input.type = 'text';
  input.value = value || '';
  if (placeholder) input.placeholder = placeholder;
  return input;
}

function profileNumberOverride(value, inherited, min, max, step) {
  const input = document.createElement('input');
  input.type = 'number';
  input.value = value === undefined || value === null ? '' : String(value);
  input.placeholder = `Inherit ${inherited}`;
  input.min = String(min);
  input.max = String(max);
  input.step = String(step || 1);
  return input;
}

function profileRequiredSelect(value, inherited) {
  const select = document.createElement('select');
  const options = [
    ['', `Inherit (${inherited ? 'required' : 'optional'})`],
    ['true', 'Required'],
    ['false', 'Optional'],
  ];
  options.forEach(([optionValue, label]) => {
    const option = document.createElement('option');
    option.value = optionValue;
    option.textContent = label;
    option.selected = value === undefined ? optionValue === '' : String(value) === optionValue;
    select.appendChild(option);
  });
  return select;
}

function profileMultiline(value, placeholder) {
  const input = document.createElement('textarea');
  input.rows = 3;
  input.value = Array.isArray(value) ? value.join('\n') : '';
  input.placeholder = placeholder || '';
  return input;
}

function profileField(label, input, help) {
  const row = el('div', 'rules-field');
  const labelNode = el('label', 'rules-label', label);
  labelNode.appendChild(input);
  row.appendChild(labelNode);
  if (help) row.appendChild(el('div', 'muted rules-help', help));
  return row;
}

function profileSplitList(value) {
  return String(value || '').split(/[\n,]+/).map((item) => item.trim()).filter(Boolean);
}

function profileForHostname(hostname) {
  const store = DomainProfiles.normalizeStore(profilesUiState.store);
  return store.profiles[hostname] || DomainProfiles.normalizeProfile({ hostname });
}

function buildProfileEditor(hostname, profile, globalRules) {
  const refs = { thresholds: {}, required: {}, ignore: [] };

  const identity = el('div', 'card');
  identity.appendChild(el('div', 'card-header', 'Current hostname profile'));
  identity.appendChild(profileField('Hostname', profileTextInput(hostname), 'Exact hostname match only. Subdomains do not inherit this profile automatically.'));
  const hostnameInput = identity.querySelector ? identity.querySelector('input') : null;
  if (hostnameInput) hostnameInput.disabled = true;
  const label = profileTextInput(profile.label, 'Optional profile label');
  refs.label = label;
  identity.appendChild(profileField('Label', label));
  const enabled = document.createElement('input');
  enabled.type = 'checkbox';
  enabled.checked = profile.enabled !== false;
  refs.enabled = enabled;
  identity.appendChild(profileField('Enabled', enabled, 'Disabled profiles remain saved but global Rules are used instead.'));

  const thresholds = el('div', 'card');
  thresholds.appendChild(el('div', 'card-header', 'Per-domain threshold overrides'));
  const t = profile.rules.thresholds || {};
  const definitions = [
    ['titleMin', 'Title minimum', t.titleMin, globalRules.thresholds.titleMin, 0, 500, 1, 'Characters. Leave blank to inherit global Rules.'],
    ['titleMax', 'Title maximum', t.titleMax, globalRules.thresholds.titleMax, 1, 500, 1, 'Characters. Leave blank to inherit global Rules.'],
    ['descriptionMin', 'Description minimum', t.descriptionMin, globalRules.thresholds.descriptionMin, 0, 2000, 1, 'Characters. Leave blank to inherit global Rules.'],
    ['descriptionMax', 'Description maximum', t.descriptionMax, globalRules.thresholds.descriptionMax, 1, 2000, 1, 'Characters. Leave blank to inherit global Rules.'],
    ['oversizedImageRatio', 'Oversized image ratio', t.oversizedImageRatio, globalRules.thresholds.oversizedImageRatio, 1, 20, 0.1, 'Intrinsic/rendered width ratio.'],
  ];
  definitions.forEach(([key, labelText, value, inherited, min, max, step, help]) => {
    const input = profileNumberOverride(value, inherited, min, max, step);
    refs.thresholds[key] = input;
    thresholds.appendChild(profileField(labelText, input, help));
  });
  const imageKiB = t.imageMaxBytes === undefined ? undefined : Math.round(t.imageMaxBytes / 1024);
  const inheritedKiB = Math.round(globalRules.thresholds.imageMaxBytes / 1024);
  const imageInput = profileNumberOverride(imageKiB, inheritedKiB, 1, 102400, 1);
  refs.thresholds.imageMaxKiB = imageInput;
  thresholds.appendChild(profileField('Image file-size limit', imageInput, 'KiB. Leave blank to inherit global Rules.'));

  const required = el('div', 'card');
  required.appendChild(el('div', 'card-header', 'Per-domain required signals'));
  const requiredLabels = [
    ['title', 'Title'], ['description', 'Meta description'], ['canonical', 'Canonical'], ['h1', 'H1'],
    ['schema', 'Typed structured data'], ['hreflang', 'Hreflang'], ['https', 'HTTPS'],
  ];
  requiredLabels.forEach(([key, labelText]) => {
    const value = Object.prototype.hasOwnProperty.call(profile.rules.required || {}, key) ? profile.rules.required[key] : undefined;
    const select = profileRequiredSelect(value, globalRules.required[key]);
    refs.required[key] = select;
    required.appendChild(profileField(labelText, select));
  });

  const expected = el('div', 'card');
  expected.appendChild(el('div', 'card-header', 'Expected schema and hreflang'));
  const schemaTypes = profileMultiline(profile.expected.schemaTypes, 'Product\nBreadcrumbList');
  refs.schemaTypes = schemaTypes;
  expected.appendChild(profileField('Schema types', schemaTypes, 'One type per line or comma-separated. Missing expected types create a profile warning.'));
  const hreflang = profileMultiline(profile.expected.hreflang, 'lt\nen-us\nx-default');
  refs.hreflang = hreflang;
  expected.appendChild(profileField('Hreflang values', hreflang, 'Exact normalized language values expected on this hostname.'));

  const ignore = el('div', 'card');
  ignore.appendChild(el('div', 'card-header', 'Ignored checks for this hostname'));
  ignore.appendChild(el('div', 'muted rules-help', 'Checked findings are ignored only for this exact hostname. Global disabled checks still apply everywhere.'));
  const ignored = new Set(profile.ignoreChecks || []);
  CustomRules.CHECKS.concat(DomainProfiles.PROFILE_CHECKS).forEach((definition) => {
    const row = el('label', 'rules-check-label rules-profile-ignore');
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = ignored.has(definition.id);
    row.appendChild(checkbox);
    const copy = el('span', '');
    copy.appendChild(el('span', '', definition.label));
    copy.appendChild(el('span', 'muted rules-check-id', `${definition.category} · ${definition.id}`));
    row.appendChild(copy);
    ignore.appendChild(row);
    refs.ignore.push({ id: definition.id, checkbox });
  });

  return { refs, nodes: [identity, thresholds, required, expected, ignore] };
}

function readProfileEditor(hostname) {
  if (!profileEditorRefs) return DomainProfiles.normalizeProfile({ hostname });
  const thresholds = {};
  Object.entries(profileEditorRefs.thresholds).forEach(([key, input]) => {
    if (String(input.value || '').trim() === '') return;
    const targetKey = key === 'imageMaxKiB' ? 'imageMaxBytes' : key;
    const value = Number(input.value);
    thresholds[targetKey] = key === 'imageMaxKiB' ? value * 1024 : value;
  });
  const required = {};
  Object.entries(profileEditorRefs.required).forEach(([key, select]) => {
    if (select.value === 'true') required[key] = true;
    if (select.value === 'false') required[key] = false;
  });
  const ignoreChecks = profileEditorRefs.ignore.filter((item) => item.checkbox.checked).map((item) => item.id);
  return {
    version: DomainProfiles.SCHEMA_VERSION,
    hostname,
    label: profileEditorRefs.label.value,
    enabled: profileEditorRefs.enabled.checked,
    rules: { thresholds, required, severityOverrides: {} },
    expected: {
      schemaTypes: profileSplitList(profileEditorRefs.schemaTypes.value),
      hreflang: profileSplitList(profileEditorRefs.hreflang.value),
    },
    ignoreChecks,
  };
}

async function saveCurrentProfile(hostname) {
  const raw = readProfileEditor(hostname);
  const errors = DomainProfiles.validateProfile(raw);
  if (errors.length) {
    profilesUiState.error = errors.join(' ');
    profilesUiState.message = '';
    renderProfiles();
    return;
  }
  try {
    const next = DomainProfiles.upsert(profilesUiState.store, raw);
    await browser.storage.local.set({ [DomainProfiles.STORAGE_KEY]: next });
    profilesUiState.store = next;
    profilesUiState.error = '';
    profilesUiState.message = `Profile saved locally for ${hostname}. Re-running the audit…`;
    renderProfiles();
    await refresh();
  } catch (_error) {
    profilesUiState.error = 'Could not save the domain profile.';
    profilesUiState.message = '';
    renderProfiles();
  }
}

async function deleteCurrentProfile(hostname) {
  try {
    const next = DomainProfiles.remove(profilesUiState.store, hostname);
    await browser.storage.local.set({ [DomainProfiles.STORAGE_KEY]: next });
    profilesUiState.store = next;
    profilesUiState.error = '';
    profilesUiState.message = `Profile removed for ${hostname}. Global Rules are active again.`;
    renderProfiles();
    await refresh();
  } catch (_error) {
    profilesUiState.error = 'Could not remove the domain profile.';
    renderProfiles();
  }
}

function appendSavedProfiles(panel) {
  const store = DomainProfiles.normalizeStore(profilesUiState.store);
  const keys = Object.keys(store.profiles).sort();
  const card = el('div', 'card');
  card.appendChild(el('div', 'card-header', `Saved profiles (${keys.length}/${DomainProfiles.MAX_PROFILES})`));
  if (!keys.length) {
    card.appendChild(el('div', 'empty', 'No domain profiles saved yet.'));
  } else {
    keys.forEach((hostname) => {
      const profile = store.profiles[hostname];
      const row = el('div', 'profile-saved-row');
      const copy = el('div', '');
      copy.appendChild(el('div', '', profile.label ? `${profile.label} · ${hostname}` : hostname));
      copy.appendChild(el('div', 'muted', profile.enabled ? 'Enabled' : 'Disabled'));
      row.appendChild(copy);
      row.appendChild(badge(profile.enabled ? 'active' : 'disabled', profile.enabled ? 'ok' : 'info'));
      card.appendChild(row);
    });
  }
  panel.appendChild(card);
}

function renderProfiles() {
  const panel = document.getElementById('profiles');
  if (!panel) return;
  clear(panel);

  const hostname = profilesCurrentHostname();
  if (profilesUiState.hostname !== hostname) {
    profilesUiState.hostname = hostname;
    profilesUiState.message = '';
    profilesUiState.error = '';
  }
  if (!profilesUiState.loaded && !profilesUiState.loading) loadProfilesStore().catch(() => {});

  if (profilesUiState.error) panel.appendChild(el('div', 'issue critical', profilesUiState.error));
  if (profilesUiState.message) panel.appendChild(el('div', 'issue info', profilesUiState.message));

  const intro = el('div', 'card');
  intro.appendChild(el('div', 'card-header', 'Local hostname profiles'));
  intro.appendChild(el('div', 'serp-note', 'Profiles are stored only in Firefox extension storage. Public source contains no saved hostname values. Matching is exact by hostname; wildcard and automatic subdomain inheritance are intentionally not used.'));
  panel.appendChild(intro);

  if (!hostname) {
    panel.appendChild(el('div', 'empty', 'Open an HTTP/HTTPS page to create or edit a hostname profile.'));
    appendSavedProfiles(panel);
    return;
  }

  const store = DomainProfiles.normalizeStore(profilesUiState.store);
  const existing = Boolean(store.profiles[hostname]);
  const profile = profileForHostname(hostname);
  const globalRules = rulesUiState && rulesUiState.config
    ? CustomRules.normalize(rulesUiState.config)
    : CustomRules.normalize(null);

  const toolbar = el('div', 'toolbar');
  const save = el('button', '', existing ? 'Save profile' : 'Create profile');
  save.type = 'button';
  save.addEventListener('click', () => saveCurrentProfile(hostname).catch(() => {}));
  toolbar.appendChild(save);
  if (existing) {
    const remove = el('button', '', 'Delete profile');
    remove.type = 'button';
    remove.addEventListener('click', () => deleteCurrentProfile(hostname).catch(() => {}));
    toolbar.appendChild(remove);
  }
  toolbar.appendChild(badge(existing ? 'saved' : 'not saved', existing ? 'ok' : 'info'));
  panel.appendChild(toolbar);

  const editor = buildProfileEditor(hostname, profile, globalRules);
  profileEditorRefs = editor.refs;
  editor.nodes.forEach((node) => panel.appendChild(node));
  appendSavedProfiles(panel);
}

loadProfilesStore().catch(() => {});
