import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const shellSource = readFileSync(
  new URL('./product-page-shell.tsx', import.meta.url),
  'utf8'
);

test('workspace logo returns to the real Home route', () => {
  assert.match(shellSource, /href="\/"/);
  assert.doesNotMatch(shellSource, /href=\{Routes\.History\}/);
});
const apiConfigSource = readFileSync(
  new URL('./workspace-api-config-dialog.tsx', import.meta.url),
  'utf8'
);

test('workspace header keeps mode switching, shared assets, and API configuration actions', () => {
  assert.match(shellSource, /WorkspaceApiConfigDialog/);
  assert.match(shellSource, /\/assets\//);
  assert.doesNotMatch(shellSource, /header\.studio/);
  assert.match(shellSource, /header\.canvas/);
  assert.match(shellSource, /header\.editor/);
  assert.match(shellSource, /header\.assets/);
  assert.doesNotMatch(shellSource, /href=\{`\/studio\/\$\{projectId\}`\}/);
  assert.match(shellSource, /href=\{`\/canvas\/\$\{projectId\}`\}/);
  assert.match(shellSource, /href=\{`\/editor\/\$\{projectId\}`\}/);
  assert.doesNotMatch(shellSource, /aria-current=\{workspaceMode === 'studio'/);
  assert.match(shellSource, /aria-current=\{workspaceMode === 'canvas'/);
  assert.match(shellSource, /aria-current=\{workspaceMode === 'editor'/);
  assert.match(shellSource, /aria-current=\{workspaceMode === 'assets'/);
  assert.doesNotMatch(shellSource, /DropdownMenu/);
  assert.doesNotMatch(shellSource, /ChevronDown/);
  assert.doesNotMatch(shellSource, /header\.create/);
  assert.match(shellSource, /GitHubIcon/);
  assert.match(
    shellSource,
    /https:\/\/github\.com\/BeatAPI\/BeatDesign/
  );
  assert.match(shellSource, /target="_blank"/);
  assert.match(shellSource, /rel="noreferrer"/);
  assert.match(shellSource, /\{ workspaceMode \}/);
  assert.doesNotMatch(shellSource, /usePricingModal/);
  assert.doesNotMatch(shellSource, /credits\.upgrade/);
  assert.doesNotMatch(shellSource, /getUserInitial/);
});

test('API configuration presets the BeatAPI endpoint and saves key + host', () => {
  assert.match(apiConfigSource, /getBeatCanvasProviderPublicConfig/);
  assert.match(apiConfigSource, /DEFAULT_BEATAPI_BASE_URL/);
  assert.match(apiConfigSource, /\/api\/config\/beatapi/);
  assert.match(apiConfigSource, /\/api\/config\/storage/);
  assert.match(apiConfigSource, /'beatapi' \| 's3'/);
  assert.match(apiConfigSource, /apiGet<StorageConfigState>\('\/api\/config\/storage'\)/);
  assert.match(apiConfigSource, /apiPost\('\/api\/config\/storage'/);
  assert.match(apiConfigSource, /https:\/\/beatapi\.io\/dashboard\/apikeys/);
  assert.doesNotMatch(apiConfigSource, /apiJson(?:Get|Post).*\/api\/config\/storage/);
});

test('API configuration exposes persisted connection state without revealing the key', () => {
  const bailianForm = apiConfigSource.slice(apiConfigSource.indexOf('function BailianConfigForm'), apiConfigSource.indexOf('function ApiConfigForm'));
  assert.match(bailianForm, /\/api\/demo\/config/);
  assert.match(bailianForm, /setLoaded\(true\)/);
  assert.match(bailianForm, /setConfigured\(state\.configured\)/);
  assert.match(bailianForm, /type="password"/);
  assert.match(bailianForm, /setApiKey\(''\)/);
  const visibleDialog = apiConfigSource.slice(apiConfigSource.indexOf('export function WorkspaceApiConfigDialog'));
  assert.doesNotMatch(visibleDialog, /ApiConfigForm|StorageConfigForm|legacyBeatapi/);
  assert.match(apiConfigSource, /apiKeyPreview/);
  assert.match(apiConfigSource, /maskApiKeyPreview/);
  assert.match(apiConfigSource, /bg-\[#c7f36b\]/);
  assert.doesNotMatch(apiConfigSource, /connectHint/);
  assert.doesNotMatch(apiConfigSource, /replaceKey/);
  assert.doesNotMatch(apiConfigSource, /changeKey/);
  assert.match(apiConfigSource, /configured && !editing/);
  assert.match(apiConfigSource, /configuredKeyMask/);
  assert.doesNotMatch(apiConfigSource, /type="text"[\s\S]{0,120}id="beatapi-key"/);
});
