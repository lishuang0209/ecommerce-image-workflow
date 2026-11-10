import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { getBeatDesignDataRoot } from '@/config/data-root';

export type ShortfilmSessionRecord = {
  projectId: string;
  sessionId: string;
  scenario: 'ecommerce_ad';
  createdAt: string;
  /** Stage ids the user has already confirmed and advanced past. */
  confirmedStages?: string[];
  /** Upstream edits or a failed rerun require a fresh storyboard before confirmation. */
  storyboardStale?: boolean;
  referenceStale?: boolean;
  videoStale?: boolean;
  /** Undefined with videoStale means all clips (including legacy sessions). */
  staleVideoIds?: string[];
  finalStale?: boolean;
};

const sessionRoot = () => resolve(getBeatDesignDataRoot(), 'shortfilm-sessions');

const sessionPath = (projectId: string) => {
  if (!/^[a-f0-9-]{36}$/.test(projectId)) {
    throw new Error('Invalid project id.');
  }
  return resolve(sessionRoot(), `${projectId}.json`);
};

export async function readShortfilmSession(
  projectId: string
): Promise<ShortfilmSessionRecord | null> {
  try {
    const raw = await readFile(sessionPath(projectId), 'utf8');
    const parsed = JSON.parse(raw) as ShortfilmSessionRecord;
    if (
      parsed?.projectId !== projectId ||
      typeof parsed.sessionId !== 'string' ||
      !parsed.sessionId.trim()
    ) {
      return null;
    }
    return parsed;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}

export async function writeShortfilmSession(
  record: ShortfilmSessionRecord
): Promise<void> {
  const target = sessionPath(record.projectId);
  await mkdir(sessionRoot(), { recursive: true, mode: 0o700 });
  const temp = `${target}.${randomUUID()}.tmp`;
  await writeFile(temp, JSON.stringify(record, null, 2), {
    encoding: 'utf8',
    mode: 0o600,
    flag: 'wx',
  });
  await rename(temp, target);
}
