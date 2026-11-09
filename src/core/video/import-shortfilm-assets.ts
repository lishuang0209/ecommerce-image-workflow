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

  const mimeType = mediaType === 'video' ? 'video/mp4' : mimeFromUrl(url);
  if (mediaType === 'video' && (bytes.length < 12 || new TextDecoder().decode(bytes.slice(4, 8)) !== 'ftyp')) {
    throw new Error('Downloaded video is not a valid MP4 container.');
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

type ImportInput = Omit<Parameters<typeof importShortfilmMedia>[0], 'mediaType'>;
export const importShortfilmImage = (input: ImportInput) => importShortfilmMedia({ ...input, mediaType: 'image' });
export const importShortfilmVideo = (input: ImportInput) => importShortfilmMedia({ ...input, mediaType: 'video' });
