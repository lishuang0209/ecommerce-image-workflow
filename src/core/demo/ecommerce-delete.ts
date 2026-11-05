import { randomUUID } from 'node:crypto';
import { unlink } from 'node:fs/promises';
import { listProjectAssets, removeAssetFromProject } from '@/core/workspace-lib/assets/user-assets';
import { LOCAL_PROJECT_ASSET_BUCKET, resolveLocalProjectAssetPath } from '@/core/projects/local-project-assets';
import { loadProjectWithLatestSnapshot } from '@/core/projects/projects';
import { persistBeatDesignCommand } from '@/core/commands/persist';
import { ecommerceTag } from './ecommerce-contract';

const skuOf = (metadata: unknown) => ecommerceTag(metadata)?.sku ?? (metadata as { ecommerce?: { sku?: unknown } } | null)?.ecommerce?.sku;
const resizeSource = (metadata: unknown) => (metadata as { resize?: { sourceAssetId?: unknown } } | null)?.resize?.sourceAssetId;

/** Deletes ecommerce images from the project library. Canvas cards showing them are only removed with explicit confirmation. */
export async function deleteEcommerceAssets({ projectId, assetIds, sku, removeFromCanvas = false }: { projectId: string; assetIds?: string[]; sku?: string; removeFromCanvas?: boolean }) {
  type Row = Awaited<ReturnType<typeof listProjectAssets>>[number];
  const rows = (await listProjectAssets({ projectId, limit: 500 })).filter((row: Row) => row.type === 'image' && skuOf(row.metadata));
  const wanted = new Set<string>(sku ? rows.filter((row: Row) => skuOf(row.metadata) === sku).map((row: Row) => row.id) : assetIds ?? []);
  if (!wanted.size || [...wanted].some((id) => !rows.some((row: Row) => row.id === id))) throw new Error('Only ecommerce images in this project can be deleted here.');
  // Resized copies of a deleted image go with it; they are meaningless without the source.
  for (const row of rows) { const source = resizeSource(row.metadata); if (typeof source === 'string' && wanted.has(source)) wanted.add(row.id); }

  const state = await loadProjectWithLatestSnapshot({ projectId });
  if (!state) throw new Error('Project is unavailable.');
  const cards = state.snapshot.cards;
  const onCanvas = cards.filter((card) => 'assetId' in card && typeof card.assetId === 'string' && wanted.has(card.assetId));
  const ids = new Set(onCanvas.map((card) => card.id));
  if (cards.some((card) => card.kind === 'generation' && (card.status === 'pending' || card.status === 'processing') && card.referenceCardIds.some((id) => ids.has(id)))) throw new Error('Wait for the image task to finish before deleting these images.');
  if (onCanvas.length && !removeFromCanvas) return { deleted: 0, inUse: onCanvas.length, document: state.snapshot, version: state.snapshotVersion };
  if (onCanvas.length) {
    const commandId = randomUUID();
    const result = await persistBeatDesignCommand({ projectId, origin: 'ui', commandId, idempotencyKey: commandId, expectedRevision: state.snapshotVersion, command: { type: 'canvas.apply', operations: onCanvas.map((card) => ({ type: 'remove_card' as const, cardId: card.id })) } });
    if (!result.ok) throw new Error(result.message);
  }

  for (const assetId of wanted) {
    const asset = await removeAssetFromProject({ projectId, assetId });
    if (asset?.bucket === LOCAL_PROJECT_ASSET_BUCKET && asset.objectKey) await unlink(resolveLocalProjectAssetPath({ objectKey: asset.objectKey })).catch(() => undefined);
  }
  const saved = await loadProjectWithLatestSnapshot({ projectId });
  if (!saved) throw new Error('Project is unavailable.');
  return { deleted: wanted.size, inUse: 0, document: saved.snapshot, version: saved.snapshotVersion };
}
