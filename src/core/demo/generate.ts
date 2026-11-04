import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { and, eq } from 'drizzle-orm';
import { userAsset, projectAssetMembership } from '@/config/db/schema';
import { getDb } from '@/core/workspace-lib/db-adapter';
import { recordGeneration, updateGenerationById } from '@/core/effects/record-generation';
import { recordUserAsset, linkGenerationAsset } from '@/core/workspace-lib/assets/user-assets';
import { LOCAL_PROJECT_ASSET_BUCKET, persistLocalProjectAsset, resolveLocalProjectAssetPath } from '@/core/projects/local-project-assets';
import { loadProjectWithLatestSnapshot } from '@/core/projects/projects';
import { persistBeatDesignCommand } from '@/core/commands/persist';
import { buildTextCard } from '@/core/beatcanvas/text-nodes';
import { isSupportedRasterImage } from '@/lib/image-upload-validation';
import { getDemoPlan, savePlan, locks } from './service';
import { generateBailianImage } from './bailian-image';

let running = false;
export async function generateDemoImage(args: { id: string; stepId: string; referenceId: string; requestId: string; prompt: string }) {
  const plan = await getDemoPlan(args.id);
  const previous = plan.runs?.find(run => run.id === args.requestId);
  if (previous) {
    if (previous.stepId !== args.stepId || previous.referenceId !== args.referenceId || previous.prompt !== args.prompt) throw new Error('Request ID already belongs to another submission.');
    return plan;
  }
  if (locks.has(args.id)) throw new Error('Plan is busy. Wait before submitting.');
  if (running) throw new Error('Another image is running. Wait before submitting.');
  if (plan.input.kind !== 'ecommerce') throw new Error('Image execution currently supports ecommerce only.');
  const step = plan.steps?.find(item => item.id === args.stepId);
  const reference = plan.assets.find(item => item.id === args.referenceId);
  if (reference?.subject === 'reference_style') throw new Error('Choose a product image, not a style-only reference.');
  if (!step || !reference) throw new Error('Select an existing step and imported reference.');
  running = true; locks.add(args.id);
  let generationId: string | null = null;
  try {
    const db = await getDb();
    const [asset] = await db.select({ objectKey: userAsset.objectKey, mimeType: userAsset.mimeType, bucket: userAsset.bucket }).from(userAsset).innerJoin(projectAssetMembership, eq(projectAssetMembership.assetId, userAsset.id)).where(and(eq(userAsset.id, reference.id), eq(projectAssetMembership.projectId, plan.projectId))).limit(1);
    if (!asset || asset.bucket !== LOCAL_PROJECT_ASSET_BUCKET) throw new Error('Reference does not belong to this local project.');
    const bytes = await readFile(resolveLocalProjectAssetPath({ objectKey: asset.objectKey }));
    if (bytes.length > 10 * 1024 * 1024 || !isSupportedRasterImage(asset.mimeType || '', bytes)) throw new Error('Invalid reference image.');
    generationId = await recordGeneration({ projectId: plan.projectId, effectId: 37, status: 'processing', input: { provider: 'bailian', model: 'qwen-image-2.1-turbo', prompt: args.prompt, referenceAssetId: reference.id, ratio: step.ratio } });
    if (!generationId) throw new Error('Unable to persist generation.');
    const run = { id: args.requestId, stepId: step.id, referenceId: reference.id, prompt: args.prompt, generationId, status: 'processing' as const, createdAt: new Date().toISOString() };
    plan.runs = [...(plan.runs || []), run];
    await savePlan(plan);
    await linkGenerationAsset({ generationId, assetId: reference.id, role: 'input' });
    const output = await generateBailianImage({ bytes, mimeType: asset.mimeType!, prompt: args.prompt, ratio: step.ratio });
    const persisted = await persistLocalProjectAsset({ projectId: plan.projectId, filename: `${step.id}-${args.requestId}.png`, mimeType: 'image/png', bytes: output.bytes });
    await recordUserAsset({ id: persisted.assetId, type: 'image', source: 'provider', bucket: LOCAL_PROJECT_ASSET_BUCKET, objectKey: persisted.objectKey, publicUrl: persisted.publicUrl, storageProvider: 'local', originProjectId: plan.projectId, filename: persisted.filename, mimeType: 'image/png', sha256: persisted.sha256, sizeBytes: persisted.sizeBytes, metadata: { provider: 'bailian', model: 'qwen-image-2.1-turbo', requestId: output.requestId } });
    await linkGenerationAsset({ generationId, assetId: persisted.assetId, role: 'output' });
    // Save the paid output before placing it: a placement conflict never loses the image.
    Object.assign(run, { status: 'succeeded', url: persisted.publicUrl, assetId: persisted.assetId });
    await savePlan(plan);
    await updateGenerationById({ id: generationId, status: 'succeeded', output: { images: [persisted.publicUrl], assetId: persisted.assetId, provider: 'bailian', usage: output.usage } });
    const state = await loadProjectWithLatestSnapshot({ projectId: plan.projectId });
    if (state) {
      const commandId = randomUUID();
      const result = await persistBeatDesignCommand({ projectId: plan.projectId, origin: 'ui', commandId, idempotencyKey: commandId, expectedRevision: state.snapshotVersion, command: { type: 'canvas.apply', operations: [{ type: 'upsert_card', card: { ...buildTextCard({ id: `demo-result-${run.id}`, name: step.title }), kind: 'asset', type: 'image', assetId: persisted.assetId, url: persisted.publicUrl, status: 'succeeded' }, frame: { x: 1500, y: (plan.runs.length - 1) * 390 + 100, w: 340, h: 340 } }] } });
      if (!result.ok) Object.assign(run, { error: 'Image saved. Canvas changed; open the saved image from this workflow.' });
    }
    await savePlan(plan);
    return plan;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Generation failed.';
    const run = plan.runs?.find(item => item.id === args.requestId);
    if (run?.status !== 'succeeded') {
      if (run) { run.status = 'failed'; run.error = message; await savePlan(plan); }
      if (generationId) await updateGenerationById({ id: generationId, status: 'failed', error: message });
      throw error;
    }
    run.error = 'Image saved; canvas placement needs retry.'; await savePlan(plan); return plan;
  } finally { running = false; locks.delete(args.id); }
}
