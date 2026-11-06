import sharp from 'sharp';
import { readFile, unlink } from 'node:fs/promises';
import { LOCAL_PROJECT_ASSET_BUCKET, persistLocalProjectAsset, resolveLocalProjectAssetPath } from '@/core/projects/local-project-assets';
import { deleteUserAssetById, getProjectAssetById, linkProjectAsset, listProjectAssets, recordUserAsset } from '@/core/workspace-lib/assets/user-assets';
import { generateBailianImage } from './bailian-image';
import { MAX_STYLE_IMAGES, nearestStyleFrame, stylePresetIds, stylePresets, stylePrompt, type StylePreset } from './ecommerce-style-presets';

export { MAX_STYLE_IMAGES, nearestStyleFrame, styleLabel, stylePresetIds, stylePresets, stylePrompt, type StyleFrame, type StylePreset } from './ecommerce-style-presets';

export type StyledImage = { id: string; url: string; sourceAssetId: string; preset: StylePreset; sku: string; task: string; filename: string };
type SourceOutput = { sku?: string; task?: string; ratio?: string; preserve?: string; color?: string };
const outputMeta = (metadata: unknown) => (metadata as { ecommerceOutput?: SourceOutput } | null)?.ecommerceOutput;
const styleMeta = (metadata: unknown) => (metadata as { style?: { preset?: string; sourceAssetId?: string } } | null)?.style;

function toStyled(row: { id: string; publicUrl: string; filename: string | null; metadata: unknown }): StyledImage | null {
  const style = styleMeta(row.metadata), output = outputMeta(row.metadata);
  if (!style?.sourceAssetId || !stylePresetIds.includes(style.preset as StylePreset)) return null;
  return { id: row.id, url: row.publicUrl, sourceAssetId: style.sourceAssetId, preset: style.preset as StylePreset, sku: output?.sku || '', task: output?.task || '', filename: row.filename || row.id };
}

export async function listStyledImages(projectId: string) {
  const rows: { id: string; type: string; source: string; publicUrl: string; filename: string | null; metadata: unknown }[] = await listProjectAssets({ projectId, limit: 500 });
  return rows.filter(row => row.type === 'image' && row.source === 'derived').map(row => toStyled(row)).filter((item): item is StyledImage => !!item);
}

/**
 * Paid restyle of finished ecommerce images. The original is never modified. The same source and preset is reused
 * instead of calling the model again. This is a prompt constraint, not a mask, so the result still needs a visual check.
 */
export async function restyleEcommerceImages({ projectId, assetIds, preset, generate = generateBailianImage }: {
  projectId: string; assetIds: string[]; preset: StylePreset;
  generate?: typeof generateBailianImage;
}) {
  if (!stylePresets[preset]) throw new Error('Choose a style.');
  const sources = [...new Set(assetIds)];
  if (!sources.length || sources.length > MAX_STYLE_IMAGES) throw new Error(`Restyle at most ${MAX_STYLE_IMAGES} images at a time.`);
  const existing = await listStyledImages(projectId);
  const styled: (StyledImage & { created: boolean })[] = [];
  for (const sourceId of sources) {
    const asset = await getProjectAssetById({ projectId, assetId: sourceId });
    const output = outputMeta(asset?.metadata);
    if (!asset || asset.type !== 'image' || asset.source !== 'provider' || asset.storageProvider !== 'local' || asset.bucket !== LOCAL_PROJECT_ASSET_BUCKET || !output?.sku || !output.task) throw new Error('Only saved ecommerce results can be restyled.');
    const found = existing.find(item => item.sourceAssetId === sourceId && item.preset === preset);
    if (found) { styled.push({ ...found, created: false }); continue; }
    const original = await readFile(resolveLocalProjectAssetPath({ objectKey: asset.objectKey }));
    const dimensions = await sharp(original).metadata();
    const ratio = nearestStyleFrame(dimensions.width || 1, dimensions.height || 1);
    const generated = await generate({ bytes: original, mimeType: asset.mimeType || 'image/png', prompt: stylePrompt(preset), ratio });
    const meta = await sharp(generated.bytes).metadata();
    const filename = `${output.sku}-${output.task}-${preset}.png`;
    const persisted = await persistLocalProjectAsset({ projectId, filename, mimeType: 'image/png', bytes: generated.bytes });
    const metadata = {
      provider: 'bailian', requestId: generated.requestId,
      style: { preset, sourceAssetId: sourceId },
      ecommerce: { sku: output.sku, role: 'product', preserve: output.preserve || '', color: output.color || '' },
      ecommerceOutput: { ...output, style: preset, derivedFrom: sourceId },
    };
    const id = await recordUserAsset({ id: persisted.assetId, type: 'image', source: 'derived', storageProvider: 'local', bucket: LOCAL_PROJECT_ASSET_BUCKET, objectKey: persisted.objectKey, publicUrl: persisted.publicUrl, filename: persisted.filename, mimeType: 'image/png', sizeBytes: persisted.sizeBytes, sha256: persisted.sha256, originProjectId: projectId, width: meta.width, height: meta.height, metadata });
    await linkProjectAsset({ projectId, assetId: id, role: 'generated' });
    const saved: StyledImage = { id, url: persisted.publicUrl, sourceAssetId: sourceId, preset, sku: output.sku, task: output.task, filename: persisted.filename };
    existing.push(saved);
    styled.push({ ...saved, created: true });
  }
  return styled;
}

/** Removes one restyled image only. Originals and other results are never touched. */
export async function deleteStyledImage({ projectId, assetId }: { projectId: string; assetId: string }) {
  const asset = await getProjectAssetById({ projectId, assetId });
  if (!asset || asset.source !== 'derived' || !styleMeta(asset.metadata)?.sourceAssetId || asset.storageProvider !== 'local' || asset.bucket !== LOCAL_PROJECT_ASSET_BUCKET) throw new Error('Only restyled images can be deleted here.');
  await unlink(resolveLocalProjectAssetPath({ objectKey: asset.objectKey })).catch(() => undefined);
  await deleteUserAssetById(assetId);
}
