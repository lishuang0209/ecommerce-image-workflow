import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

test('workflow import reuses identical retries, isolates projects and preserves changed versions and identities', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'beatdesign-import-dedup-'));
  process.env.BEATDESIGN_DATA_DIR = directory;
  execFileSync(process.execPath, ['node_modules/drizzle-kit/bin.cjs', 'push', '--force'], {
    env: process.env, stdio: 'pipe',
  });
  const { createProject } = await import('@/core/projects/projects');
  const { importShortfilmImage } = await import('./import-shortfilm-assets');
  const { listProjectAssets } = await import('@/core/workspace-lib/assets/user-assets');
  const first = await createProject({ name: 'Import retries' });
  const other = await createProject({ name: 'Project isolation' });
  const originalFetch = globalThis.fetch;
  let content = 'first image';
  globalThis.fetch = async () => new Response(content);
  try {
    const input = { projectId: first.id, url: 'http://localhost/example.png',
      metadata: { shortfilmAssetId: 'shot-1', kind: 'reference' } };
    const copies = await Promise.all([importShortfilmImage(input), importShortfilmImage(input)]);
    assert.equal(copies[0].assetId, copies[1].assetId);
    assert.deepEqual(await importShortfilmImage(input), copies[0]);
    assert.equal((await listProjectAssets({ projectId: first.id })).length, 1);
    assert.equal((await readdir(join(directory, 'project-assets', first.id))).length, 1);

    const foreign = await importShortfilmImage({ ...input, projectId: other.id });
    assert.notEqual(foreign.assetId, copies[0].assetId);
    const identity = await importShortfilmImage({ ...input, metadata: { ...input.metadata, shortfilmAssetId: 'shot-2' } });
    assert.notEqual(identity.assetId, copies[0].assetId);

    content = 'regenerated image';
    const changed = await importShortfilmImage(input);
    assert.notEqual(changed.assetId, copies[0].assetId);
    assert.equal((await listProjectAssets({ projectId: first.id })).length, 3);

    // A missing local file must be downloaded back into durable project storage.
    await rm(join(directory, 'project-assets', first.id, changed.assetId), { recursive: true });
    const recovered = await importShortfilmImage(input);
    assert.notEqual(recovered.assetId, changed.assetId);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
