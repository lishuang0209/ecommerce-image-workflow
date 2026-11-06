import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(
  new URL('./workspace-page.tsx', import.meta.url),
  'utf8'
);

test('projects page stays simple and resumes each project in its last workspace', () => {
  assert.doesNotMatch(source, /type="search"/);
  assert.doesNotMatch(source, /copy\.allProjects/);
  assert.match(source, /mode: project\.lastWorkspaceMode === 'studio' \? 'canvas' : project\.lastWorkspaceMode/);
  assert.match(source, /href="\/canvas"/);
  assert.doesNotMatch(source, /createProject\(/);
  assert.doesNotMatch(source, /\/demo/);
  assert.doesNotMatch(source, /href="\/studio"/);
});
