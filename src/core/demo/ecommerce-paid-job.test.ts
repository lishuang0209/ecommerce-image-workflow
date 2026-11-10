import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync, spawn } from 'node:child_process';
import sharp from 'sharp';

test('paid ecommerce jobs survive duplicate requests and uncertain submissions', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'beatdesign-paid-jobs-'));
  process.env.BEATDESIGN_DATA_DIR = directory;
  execFileSync(process.execPath, ['node_modules/drizzle-kit/bin.cjs', 'push', '--force'], { env: process.env, stdio: 'pipe' });
  const { createProject } = await import('@/core/projects/projects');
  const { persistLocalProjectAsset, LOCAL_PROJECT_ASSET_BUCKET } = await import('@/core/projects/local-project-assets');
  const { recordUserAsset, linkProjectAsset } = await import('@/core/workspace-lib/assets/user-assets');
  const { restyleEcommerceImages, deleteStyledImage } = await import('./ecommerce-style');
  const { expandEcommerceImages } = await import('./ecommerce-expand');
  const { PaidSubmissionRejectedError } = await import('./paid-submission');
  const { runEcommercePaidJob } = await import('./ecommerce-paid-job');
  const project = await createProject({ name: 'Synthetic dedupe checks' });
  const bytes = await sharp({ create: { width: 512, height: 512, channels: 3, background: '#ffffff' } }).png().toBuffer();
  async function source() {
    const asset = await persistLocalProjectAsset({ projectId: project.id, filename: 'synthetic.png', mimeType: 'image/png', bytes });
    await recordUserAsset({ id: asset.assetId, type: 'image', source: 'provider', storageProvider: 'local', bucket: LOCAL_PROJECT_ASSET_BUCKET, objectKey: asset.objectKey, publicUrl: asset.publicUrl, filename: asset.filename, mimeType: 'image/png', originProjectId: project.id, metadata: { ecommerceOutput: { sku: 'Synthetic', task: 'main' } } });
    await linkProjectAsset({ projectId: project.id, assetId: asset.assetId, role: 'generated' });
    return asset.assetId;
  }
  const base = { projectId: project.id, preset: 'daylight' as const };
  type Generate = NonNullable<Parameters<typeof restyleEcommerceImages>[0]['generate']>;
  const result = { bytes, requestId: 'fake', usage: {} };
  await t.test('concurrent overlapping batches share one call per image; completed results reuse; deletion permits regeneration', async () => {
    const a = await source(), b = await source(); let calls = 0;
    const generate: Generate = async (_, hooks) => { await hooks!.beforeSubmit(); calls++; await new Promise(r => setTimeout(r, 30)); return result; };
    const [first, second] = await Promise.all([
      restyleEcommerceImages({ ...base, assetIds: [a, b], generate }),
      restyleEcommerceImages({ ...base, assetIds: [a], generate }),
    ]);
    assert.equal(calls, 2); assert.equal(first[0].id, second[0].id); assert.equal([first[0], second[0]].filter(x => x.created).length, 1);
    const reused = await restyleEcommerceImages({ ...base, assetIds: [a, b], generate });
    assert.equal(calls, 2); assert.ok(reused.every(x => !x.created));
    await deleteStyledImage({ projectId: project.id, assetId: first[0].id });
    await restyleEcommerceImages({ ...base, assetIds: [a], generate }); assert.equal(calls, 3);
  });
  await t.test('outpaint duplicates call the provider once', async () => {
    const id = await source(); let calls = 0;
    const input = { projectId: project.id, assetIds: [id], ratios: ['3:4' as const], outpaint: (async (_, _deps, hooks) => { await hooks!.beforeSubmit(); calls++; await new Promise(r => setTimeout(r, 30)); return { ...result, width: 1080, height: 1440 }; }) as NonNullable<Parameters<typeof expandEcommerceImages>[0]['outpaint']> };
    const [a, b] = await Promise.all([expandEcommerceImages(input), expandEcommerceImages(input)]);
    assert.equal(calls, 1); assert.equal(a.derived[0].id, b.derived[0].id); assert.equal([a.derived[0], b.derived[0]].filter(x => x.created).length, 1);
    await expandEcommerceImages(input); assert.equal(calls, 1);
  });
  await t.test('local validation errors and definite rejection permit safe retries', async () => {
    for (const submitted of [false, true]) {
      const id = await source(); let calls = 0;
      const generate: Generate = async (_, hooks) => {
        calls++;
        if (submitted) await hooks!.beforeSubmit();
        if (calls === 1) throw submitted ? new PaidSubmissionRejectedError('rejected') : new Error('local validation');
        if (!submitted) await hooks!.beforeSubmit();
        return result;
      };
      await assert.rejects(restyleEcommerceImages({ ...base, assetIds: [id], generate }));
      await restyleEcommerceImages({ ...base, assetIds: [id], generate }); assert.equal(calls, 2);
    }
  });
  await t.test('timeout stays blocked, including from a new process', async () => {
    const id = await source(); let calls = 0;
    const generate: Generate = async (_, hooks) => { await hooks!.beforeSubmit(); calls++; throw new Error('network timeout after POST'); };
    const input = { ...base, assetIds: [id], generate };
    await assert.rejects(restyleEcommerceImages(input), { code: 'PAID_JOB_REVIEW_REQUIRED' });
    await assert.rejects(restyleEcommerceImages(input), { code: 'PAID_JOB_REVIEW_REQUIRED' }); assert.equal(calls, 1);
    const output = execFileSync(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', `
      import { restyleEcommerceImages } from './src/core/demo/ecommerce-style.ts';
      try { await restyleEcommerceImages(${JSON.stringify({ ...base, assetIds: [id] })}); process.exit(1); }
      catch(e) { console.log(e.code); }
    `], { env: process.env, encoding: 'utf8' });
    assert.match(output, /PAID_JOB_REVIEW_REQUIRED/);
  });
  await t.test('saved assets recover an interrupted receipt; missing files never trigger paid regeneration', async () => {
    const id = await source(); let calls = 0;
    const generate: Generate = async (_, hooks) => { await hooks!.beforeSubmit(); calls++; return result; };
    const input = { ...base, assetIds: [id], generate };
    const [saved] = await restyleEcommerceImages(input);
    const { getDb } = await import('@/core/workspace-lib/db-adapter');
    const { projectWorkflowState } = await import('@/config/db/schema');
    const { eq } = await import('drizzle-orm');
    const db = await getDb();
    await db.update(projectWorkflowState).set({ status: 'needs_review' }).where(eq(projectWorkflowState.projectId, project.id));
    const [recovered] = await restyleEcommerceImages(input);
    assert.equal(recovered.id, saved.id); assert.equal(calls, 1);
    const { getProjectAssetById } = await import('@/core/workspace-lib/assets/user-assets');
    const { resolveLocalProjectAssetPath } = await import('@/core/projects/local-project-assets');
    const asset = await getProjectAssetById({ projectId: project.id, assetId: saved.id });
    await rm(resolveLocalProjectAssetPath({ objectKey: asset!.objectKey }));
    await assert.rejects(restyleEcommerceImages(input), { code: 'PAID_JOB_REVIEW_REQUIRED' });
    assert.equal(calls, 1);
  });
  await t.test('separate processes cannot claim the same running task', async () => {
    const identity = ['cross-process'];
    const child = spawn(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', `
      import { runEcommercePaidJob } from './src/core/demo/ecommerce-paid-job.ts';
      import { once } from 'node:events';
      await runEcommercePaidJob({projectId:${JSON.stringify(project.id)},operation:'style',identity:['cross-process'],snapshot:{},findExisting:async()=>null,create:async hooks=>{
        await hooks.beforeSubmit(); console.log('CLAIMED'); await once(process.stdin,'data'); return {id:'synthetic-result'};
      }}); process.exit(0);
    `], { env: process.env, stdio: ['pipe', 'pipe', 'pipe'] });
    const exited = new Promise<number | null>((resolve, reject) => { child.once('exit', resolve); child.once('error', reject); });
    try {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('child claim timed out')), 15000);
        child.stdout.on('data', chunk => { if (String(chunk).includes('CLAIMED')) { clearTimeout(timer); resolve(); } });
        child.once('exit', () => { clearTimeout(timer); reject(new Error('child exited before claim')); });
      });
      let called = false;
      await assert.rejects(runEcommercePaidJob({ projectId: project.id, operation: 'style', identity, snapshot: {}, findExisting: async () => null, create: async () => { called = true; return { id: 'unexpected' }; } }), { code: 'PAID_JOB_PENDING' });
      assert.equal(called, false); child.stdin.end('finish'); assert.equal(await exited, 0);
    } finally { child.kill(); }
  });
  await rm(directory, { recursive: true, force: true });
});
