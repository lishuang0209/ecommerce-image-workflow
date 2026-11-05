import { readFile } from 'node:fs/promises';
import { LOCAL_PROJECT_ASSET_BUCKET, persistLocalProjectAsset, resolveLocalProjectAssetPath } from '@/core/projects/local-project-assets';
import { getProjectAssetById, linkProjectAsset, listProjectAssets, recordUserAsset } from '@/core/workspace-lib/assets/user-assets';
import { resizeRatios, resizeToRatio, type ResizeMode, type ResizeRatio } from './image-resize';

export type ResizeChoice = 'auto' | ResizeMode;
type SourceOutput = { sku?: string; task?: string; ratio?: string; preserve?: string; color?: string };
export type DerivedSize = { id: string; url: string; sourceAssetId: string; ratio: ResizeRatio; mode: ResizeMode; sku: string; task: string; filename: string };

const resizeMeta = (metadata: unknown) => (metadata as { resize?: { ratio?: ResizeRatio; mode?: ResizeMode; sourceAssetId?: string } } | null)?.resize;
const outputMeta = (metadata: unknown) => (metadata as { ecommerceOutput?: SourceOutput } | null)?.ecommerceOutput;

function toDerived(row: { id: string; publicUrl: string; filename: string | null; metadata: unknown }): DerivedSize | null {
  const resize = resizeMeta(row.metadata), output = outputMeta(row.metadata);
  if (!resize?.ratio || !resize.mode || !resize.sourceAssetId) return null;
  return { id: row.id, url: row.publicUrl, sourceAssetId: resize.sourceAssetId, ratio: resize.ratio, mode: resize.mode, sku: output?.sku || '', task: output?.task || '', filename: row.filename || row.id };
}

export async function listDerivedSizes(projectId: string) {
  const rows: { id: string; type: string; source: string; publicUrl: string; filename: string | null; metadata: unknown }[] = await listProjectAssets({ projectId, limit: 500 });
  return rows.filter(row => row.type === 'image' && row.source === 'derived').map(row => toDerived(row)).filter((item): item is DerivedSize => !!item);
}

/**
 * Batch size change for finished ecommerce results. Pure local image processing, never a model call.
 * Sources are limited to this project's saved ecommerce outputs; the originals are never modified, and a
 * derived image can never be adopted as a main image or used as a product photo.
 */
export async function deriveResizedAssets({ projectId, assetIds, ratios, mode }: { projectId: string; assetIds: string[]; ratios: ResizeRatio[]; mode: ResizeChoice }) {
  const wanted = [...new Set(ratios)];
  const sources = [...new Set(assetIds)];
  if (!sources.length || sources.length > 40) throw new Error('Choose 1–40 finished images.');
  if (!wanted.length || wanted.some(ratio => !resizeRatios.includes(ratio))) throw new Error('Choose supported target ratios.');
  const existing: DerivedSize[] = await listDerivedSizes(projectId);
  const results: (DerivedSize & { created: boolean })[] = [];
  for (const sourceId of sources) {
    const asset = await getProjectAssetById({ projectId, assetId: sourceId });
    const output = outputMeta(asset?.metadata);
    if (!asset || asset.type !== 'image' || asset.source !== 'provider' || asset.storageProvider !== 'local' || asset.bucket !== LOCAL_PROJECT_ASSET_BUCKET || !output?.sku || !output.task) throw new Error('Only saved ecommerce results can be resized.');
    const effective: ResizeMode = mode === 'auto' ? (output.task === 'main' ? 'pad' : 'crop') : mode;
    const original = await readFile(resolveLocalProjectAssetPath({ objectKey: asset.objectKey }));
    for (const ratio of wanted) {
      const found = existing.find(item => item.sourceAssetId === sourceId && item.ratio === ratio && item.mode === effective);
      if (found) { results.push({ ...found, created: false }); continue; }
      const resized = await resizeToRatio({ bytes: original, ratio, mode: effective });
      const filename = `${output.sku}-${output.task}-${ratio.replace(':', 'x')}-${effective}.png`;
      const persisted = await persistLocalProjectAsset({ projectId, filename, mimeType: 'image/png', bytes: resized.bytes });
      const metadata = {
        provider: 'local-resize',
        resize: { ratio, mode: effective, sourceAssetId: sourceId },
        ecommerce: { sku: output.sku, role: 'product', preserve: output.preserve || '', color: output.color || '' },
        // Marks it as a generated result so it is never read back as a raw product photo, and carries no sourceCardId so it cannot be adopted.
        ecommerceOutput: { ...output, ratio, derivedFrom: sourceId },
      };
      const id = await recordUserAsset({ id: persisted.assetId, type: 'image', source: 'derived', storageProvider: 'local', bucket: LOCAL_PROJECT_ASSET_BUCKET, objectKey: persisted.objectKey, publicUrl: persisted.publicUrl, filename: persisted.filename, mimeType: 'image/png', sizeBytes: persisted.sizeBytes, sha256: persisted.sha256, originProjectId: projectId, width: resized.width, height: resized.height, metadata });
      await linkProjectAsset({ projectId, assetId: id, role: 'generated' });
      const derived = toDerived({ id, publicUrl: persisted.publicUrl, filename: persisted.filename, metadata })!;
      existing.push(derived);
      results.push({ ...derived, created: true });
    }
  }
  return results;
}
