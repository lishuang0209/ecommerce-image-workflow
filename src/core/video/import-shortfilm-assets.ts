import {
  LOCAL_PROJECT_ASSET_BUCKET,
  persistLocalProjectAsset,
} from '@/core/projects/local-project-assets';
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

export async function importShortfilmImage({
  projectId,
  url,
  filename,
  metadata,
}: {
  projectId: string;
  url: string;
  filename?: string;
  metadata?: Record<string, unknown>;
}): Promise<ImportedShortfilmImage> {
  const response = await fetch(url, { signal: AbortSignal.timeout(120_000) });
  if (!response.ok) {
    throw new Error(`Failed to download shortfilm image (${response.status}).`);
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength === 0) {
    throw new Error('Downloaded image is empty.');
  }

  const mimeType = mimeFromUrl(url);
  const persisted = await persistLocalProjectAsset({
    projectId,
    filename: filename ?? basename(url),
    mimeType,
    bytes,
  });
  const assetId = await recordUserAsset({
    id: persisted.assetId,
    type: 'image',
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
    metadata: { provider: 'shortfilm', ...(metadata ?? {}) },
  });
  await linkProjectAsset({ projectId, assetId, role: 'generated' });

  return {
    assetId,
    publicUrl: persisted.publicUrl,
    filename: persisted.filename,
    mimeType,
    sizeBytes: persisted.sizeBytes,
  };
}
