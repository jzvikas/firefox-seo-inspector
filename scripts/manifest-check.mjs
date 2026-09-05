import fs from 'node:fs';

const manifest = JSON.parse(fs.readFileSync('src/manifest.json', 'utf8'));
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));

function fail(message) {
  console.error(`Manifest check failed: ${message}`);
  process.exit(1);
}

if (manifest.manifest_version !== 3) fail('manifest_version must be 3');
if (manifest.version !== pkg.version) fail('manifest version must match package.json');
if (!manifest.background || !Array.isArray(manifest.background.scripts) || !manifest.background.scripts.length) fail('Firefox MV3 background.scripts is required');
if (manifest.background.service_worker) fail('Firefox build must not depend on background.service_worker');
if (!manifest.sidebar_action || !manifest.sidebar_action.default_panel) fail('sidebar_action.default_panel is required');
if (!manifest.action) fail('action is required');
if (!Array.isArray(manifest.content_scripts) || !manifest.content_scripts.length) fail('content_scripts are required');
if (!Array.isArray(manifest.host_permissions) || !manifest.host_permissions.includes('https://*/*')) fail('HTTPS host permission is required for page inspection');
const csp = manifest.content_security_policy && manifest.content_security_policy.extension_pages;
if (!csp || !csp.includes("script-src 'self'") || !csp.includes("object-src 'none'")) fail('restrictive extension CSP is required');
if (/unsafe-eval|unsafe-inline|https?:/i.test(csp)) fail('extension CSP must not allow unsafe or remote script execution');

const referenced = new Set();
referenced.add(manifest.sidebar_action.default_panel);
if (manifest.sidebar_action.default_icon) referenced.add(manifest.sidebar_action.default_icon);
if (manifest.action.default_icon) referenced.add(manifest.action.default_icon);
for (const script of manifest.background.scripts) referenced.add(script);
for (const group of manifest.content_scripts) for (const script of group.js || []) referenced.add(script);
for (const file of Object.values(manifest.icons || {})) referenced.add(file);
for (const file of referenced) if (!fs.existsSync(`src/${file}`)) fail(`referenced file does not exist: ${file}`);

console.log('Manifest checks passed.');
