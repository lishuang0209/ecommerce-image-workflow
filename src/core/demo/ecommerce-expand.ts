import sharp from 'sharp';
import { readFile } from 'node:fs/promises';
import { LOCAL_PROJECT_ASSET_BUCKET, persistLocalProjectAsset, resolveLocalProjectAssetPath } from '@/core/projects/local-project-assets';
import { getProjectAssetById, linkProjectAsset, recordUserAsset } from '@/core/workspace-lib/assets/user-assets';
import { outpaintBailianImage } from './bailian-outpaint';
import { listDerivedSizes, type DerivedSize } from './ecommerce-resize';
import { expandScales, MAX_EXPAND_IMAGES } from './image-expand';
import type { ResizeRatio } from './image-resize';

type SourceOutput = { sku?: string; task?: string; ratio?: string; preserve?: string; color?: string };
const outputMeta = (metadata: unknown) => (metadata as { ecommerceOutput?: SourceOutput } | null)?.ecommerceOutput;

/**
 * Paid outpainting for finished ecommerce images. The original is never modified. An image that is already
 * the target ratio is skipped and does not call the model. A previous expansion of the same image is reused.
 */
export async function expandEcommerceImages({ projectId, assetIds, ratios, outpaint = outpaintBailianImage }: {
  projectId: string; assetIds: string[]; ratios: ResizeRatio[];
  outpaint?: typeof outpaintBailianImage;
}) {
  const wanted = [...new Set(ratios)];
  const sources = [...new Set(assetIds)];
  if (!sources.length || sources.length * wanted.length > MAX_EXPAND_IMAGES) throw new Error(`Expand at most ${MAX_EXPAND_IMAGES} images at a time.`);
  const existing: DerivedSize[] = await listDerivedSizes(projectId);
  const derived: (DerivedSize & { created: boolean })[] = [];
  const skipped: { assetId: string; ratio: ResizeRatio }[] = [];
  for (const sourceId of sources) {
    const asset = await getProjectAssetById({ projectId, assetId: sourceId });
    const output = outputMeta(asset?.metadata);
    if (!asset || asset.type !== 'image' || asset.source !== 'provider' || asset.storageProvider !== 'local' || asset.bucket !== LOCAL_PROJECT_ASSET_BUCKET || !output?.sku || !output.task) throw new Error('Only saved ecommerce results can be expanded.');
    const original = await readFile(resolveLocalProjectAssetPath({ objectKey: asset.objectKey }));
    const dimensions = await sharp(original).metadata();
    for (const ratio of wanted) {
      const scales = expandScales(dimensions.width || 1, dimensions.height || 1, ratio);
      if (!scales) { skipped.push({ assetId: sourceId, ratio }); continue; }
      const found = existing.find(item => item.sourceAssetId === sourceId && item.ratio === ratio && item.mode === 'expand');
      if (found) { derived.push({ ...found, created: false }); continue; }
      const expanded = await outpaint({ bytes: original, mimeType: asset.mimeType || 'image/png', ratio });
      const filename = `${output.sku}-${output.task}-${ratio.replace(':', 'x')}-expand.png`;
      const persisted = await persistLocalProjectAsset({ projectId, filename, mimeType: 'image/png', bytes: expanded.bytes });
      const metadata = {
        provider: 'bailian-outpaint', requestId: expanded.requestId,
        resize: { ratio, mode: 'expand', sourceAssetId: sourceId },
        ecommerce: { sku: output.sku, role: 'product', preserve: output.preserve || '', color: output.color || '' },
        ecommerceOutput: { ...output, ratio, derivedFrom: sourceId },
      };
      const id = await recordUserAsset({ id: persisted.assetId, type: 'image', source: 'derived', storageProvider: 'local', bucket: LOCAL_PROJECT_ASSET_BUCKET, objectKey: persisted.objectKey, publicUrl: persisted.publicUrl, filename: persisted.filename, mimeType: 'image/png', sizeBytes: persisted.sizeBytes, sha256: persisted.sha256, originProjectId: projectId, width: expanded.width, height: expanded.height, metadata });
      await linkProjectAsset({ projectId, assetId: id, role: 'generated' });
      const saved: DerivedSize = { id, url: persisted.publicUrl, sourceAssetId: sourceId, ratio, mode: 'expand', sku: output.sku, task: output.task, filename: persisted.filename };
      existing.push(saved);
      derived.push({ ...saved, created: true });
    }
  }
  return { derived, skipped };
}
