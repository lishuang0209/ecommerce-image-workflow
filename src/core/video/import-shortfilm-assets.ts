import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { and, asc, eq } from 'drizzle-orm';
import { projectAssetMembership, userAsset } from '@/config/db/schema';
import { withDatabaseTransaction } from '@/core/db/transaction-context';
import {
  LOCAL_PROJECT_ASSET_BUCKET,
  persistLocalProjectAsset,
  resolveLocalProjectAssetPath,
} from '@/core/projects/local-project-assets';
import { access } from 'node:fs/promises';
import {
  linkProjectAsset,
  recordUserAsset,
} from '@/core/workspace-lib/assets/user-assets';
import { getShortfilmBaseUrl } from './shortfilm-client';

const MIME_BY_EXT: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.bmp': 'image/bmp',
};

/** shortfilm stores artifact paths relative to its backend dir, e.g. code/result/image/... */
export function shortfilmAssetUrl(path: string): string {
  if (/^https?:\/\//.test(path)) return path;
  const clean = path.replace(/^\/+/, '');
  return `${getShortfilmBaseUrl()}/${clean}`;
}

function mimeFromUrl(url: string): string {
  const ext = url.split('?')[0].split('.').pop()?.toLowerCase() ?? '';
  return MIME_BY_EXT[`.${ext}`] ?? 'image/png';
}

function basename(url: string): string {
  const clean = url.split('?')[0];
  return clean.split('/').pop() || 'image.png';
}

export type ImportedShortfilmImage = {
  assetId: string;
  publicUrl: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
};

async function importShortfilmMedia({
  projectId,
  url,
  filename,
  metadata,
  mediaType = 'image',
}: {
  projectId: string;
  url: string;
  mediaType?: 'image' | 'video';
  filename?: string;
  metadata?: Record<string, unknown>;
}): Promise<ImportedShortfilmImage> {
  const response = await fetch(url, { signal: AbortSignal.timeout(120_000) });
  if (!response.ok) {
    throw new Error(`Failed to download shortfilm media (${response.status}).`);
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength === 0) {
    throw new Error('Downloaded media is empty.');
  }

  const webm = mediaType === 'video' && new URL(url).pathname.toLowerCase().endsWith('.webm');
  const mimeType = mediaType === 'video' ? (webm ? 'video/webm' : 'video/mp4') : mimeFromUrl(url);
  if (mediaType === 'video' && (webm
    ? bytes.length < 16 || ![0x1a, 0x45, 0xdf, 0xa3].every((value, index) => bytes[index] === value) || !new TextDecoder().decode(bytes.slice(0, 128)).includes('webm')
    : bytes.length < 12 || new TextDecoder().decode(bytes.slice(4, 8)) !== 'ftyp')) {
    throw new Error('Downloaded video is not a valid MP4 or WebM container.');
  }
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const importMetadata = { provider: 'shortfilm', ...(metadata ?? {}) };
  // Download outside the transaction. Serialize the content lookup and insert so
  // retries (including concurrent requests) reuse the same project-owned Asset.
  return withDatabaseTransaction(async (db) => {
    const existing = await db.select({ asset: userAsset }).from(userAsset)
      .innerJoin(projectAssetMembership, eq(projectAssetMembership.assetId, userAsset.id))
      .where(and(
        eq(projectAssetMembership.projectId, projectId),
        eq(userAsset.type, mediaType),
        eq(userAsset.source, 'provider'),
        eq(userAsset.storageProvider, 'local'),
        eq(userAsset.bucket, LOCAL_PROJECT_ASSET_BUCKET),
        eq(userAsset.sha256, sha256),
      )).orderBy(asc(userAsset.createdAt), asc(userAsset.id));
    for (const { asset } of existing) {
      // Keep distinct workflow identities/lineage even when their pixels match.
      if (!isDeepStrictEqual(asset.metadata, importMetadata)) continue;
      try { await access(resolveLocalProjectAssetPath({ objectKey: asset.objectKey })); }
      catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue;
        throw error;
      }
      await linkProjectAsset({ projectId, assetId: asset.id, role: 'generated' });
      return {
        assetId: asset.id, publicUrl: asset.publicUrl,
        filename: asset.filename ?? basename(url),
        mimeType: asset.mimeType ?? mimeType, sizeBytes: asset.sizeBytes ?? bytes.byteLength,
      };
    }
    const persisted = await persistLocalProjectAsset({
      projectId,
      filename: filename ?? basename(url),
      mimeType,
      bytes,
    });
    const assetId = await recordUserAsset({
      id: persisted.assetId,
      type: mediaType,
      source: 'provider',
      storageProvider: 'local',
      bucket: LOCAL_PROJECT_ASSET_BUCKET,
      objectKey: persisted.objectKey,
      publicUrl: persisted.publicUrl,
      filename: persisted.filename,
      mimeType,
      sizeBytes: persisted.sizeBytes,
      sha256: persisted.sha256,
      originProjectId: projectId,
      metadata: importMetadata,
    });
    await linkProjectAsset({ projectId, assetId, role: 'generated' });

    return {
      assetId,
      publicUrl: persisted.publicUrl,
      filename: persisted.filename,
      mimeType,
      sizeBytes: persisted.sizeBytes,
    };
  });
}

type ImportInput = Omit<Parameters<typeof importShortfilmMedia>[0], 'mediaType'>;
export const importShortfilmImage = (input: ImportInput) => importShortfilmMedia({ ...input, mediaType: 'image' });
export const importShortfilmVideo = (input: ImportInput) => importShortfilmMedia({ ...input, mediaType: 'video' });
