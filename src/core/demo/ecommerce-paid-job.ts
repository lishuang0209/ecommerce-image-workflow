import { createHash, randomUUID } from 'node:crypto';
import { access } from 'node:fs/promises';
import { and, desc, eq, sql } from 'drizzle-orm';
import { projectAssetMembership, projectWorkflowState, userAsset } from '@/config/db/schema';
import { getLocalDatabaseUrl } from '@/core/db';
import { withDatabaseTransaction } from '@/core/db/transaction-context';
import { getDb } from '@/core/workspace-lib/db-adapter';
import { getProjectAssetById } from '@/core/workspace-lib/assets/user-assets';
import { resolveLocalProjectAssetPath } from '@/core/projects/local-project-assets';
import { PaidSubmissionRejectedError, type PaidSubmissionHooks } from './paid-submission';

const workflowType = 'ecommerce-paid-generation';
const preparingLeaseMs = 5 * 60_000;
type Saved = { id: string };
const inFlight = new Map<string, Promise<Saved & { created: boolean }>>();

export class EcommercePaidJobError extends Error {
  constructor(public readonly code: 'PAID_JOB_PENDING' | 'PAID_JOB_REVIEW_REQUIRED', public readonly jobId: string) {
    super(code === 'PAID_JOB_PENDING'
      ? 'This image task is running or awaiting verification. No duplicate request was sent. Refresh the results; if it was interrupted, check the provider before retrying.'
      : 'The previous image request may have been accepted or its saved result is unavailable. Check the provider and local results before generating again; automatic resubmission is blocked.');
  }
}

/** Search the entire project, not the first 500 library rows. Paths are server-owned. */
export async function findDerivedImage(projectId: string, metadata: Record<string, string>) {
  const db = await getDb();
  const rows = await db.select({ asset: userAsset }).from(userAsset)
    .innerJoin(projectAssetMembership, eq(projectAssetMembership.assetId, userAsset.id))
    .where(and(
      eq(projectAssetMembership.projectId, projectId), eq(userAsset.type, 'image'),
      eq(userAsset.source, 'derived'), eq(userAsset.storageProvider, 'local'),
      ...Object.entries(metadata).map(([path, value]) => sql`json_extract(${userAsset.metadata}, ${path}) = ${value}`),
    )).orderBy(desc(userAsset.createdAt)).limit(1);
  return rows[0]?.asset ?? null;
}

async function readableResult(projectId: string, result: Saved, jobId: string) {
  const asset = await getProjectAssetById({ projectId, assetId: result.id });
  if (!asset) return false; // Explicitly deleted results can be generated again.
  try { await access(resolveLocalProjectAssetPath({ objectKey: asset.objectKey })); }
  catch { throw new EcommercePaidJobError('PAID_JOB_REVIEW_REQUIRED', jobId); }
  return true;
}

/**
 * Short SQLite transactions claim one semantic task across processes. Never hold
 * a database write lock while calling a provider. Submitted claims have no expiry:
 * a timeout/restart is not proof that a paid request failed remotely.
 */
export async function runEcommercePaidJob<T extends Saved>({ projectId, operation, identity, snapshot, findExisting, create }: {
  projectId: string;
  operation: 'style' | 'expand';
  identity: string[];
  snapshot: Record<string, unknown>;
  findExisting: () => Promise<T | null>;
  create: (hooks: PaidSubmissionHooks) => Promise<T>;
}): Promise<T & { created: boolean }> {
  const jobId = createHash('sha256').update(JSON.stringify([projectId, operation, ...identity])).digest('hex');
  const memoryKey = `${getLocalDatabaseUrl()}:${jobId}`;
  const pending = inFlight.get(memoryKey);
  if (pending) return { ...await pending as unknown as T, created: false };

  const run = async (): Promise<T & { created: boolean }> => {
    const ownerId = randomUUID();
    const where = and(eq(projectWorkflowState.projectId, projectId), eq(projectWorkflowState.workflowType, workflowType), eq(projectWorkflowState.workflowInstanceId, jobId));
    const reused = await withDatabaseTransaction(async db => {
      // Also recovers a result saved just before a crash in receipt completion.
      const existing = await findExisting();
      if (existing && await readableResult(projectId, existing, jobId)) {
        await db.update(projectWorkflowState).set({ status: 'succeeded', selectionJson: existing, updatedAt: new Date() }).where(where);
        return existing;
      }
      const [previous] = await db.select().from(projectWorkflowState).where(where).limit(1);
      if (previous) {
        const result = previous.selectionJson as T | null;
        if (previous.status === 'succeeded' && result?.id && await readableResult(projectId, result, jobId)) return result;
        const expiredBeforeSubmission = previous.status === 'preparing' && Date.now() - previous.updatedAt.getTime() >= preparingLeaseMs;
        if (previous.status !== 'succeeded' && !expiredBeforeSubmission) {
          throw new EcommercePaidJobError(previous.status === 'needs_review' ? 'PAID_JOB_REVIEW_REQUIRED' : 'PAID_JOB_PENDING', jobId);
        }
        await db.delete(projectWorkflowState).where(where);
      }
      await db.insert(projectWorkflowState).values({
        id: ownerId, projectId, workflowType, workflowInstanceId: jobId,
        status: 'preparing', formJson: { operation, identity, snapshot },
      });
      return null;
    });
    if (reused) return { ...reused, created: false };

    let submitted = false;
    try {
      const result = await create({ beforeSubmit: async () => {
        await withDatabaseTransaction(async db => {
          const claimed = await db.update(projectWorkflowState).set({ status: 'submitting', updatedAt: new Date() })
            .where(and(where, eq(projectWorkflowState.id, ownerId), eq(projectWorkflowState.status, 'preparing')))
            .returning({ id: projectWorkflowState.id });
          if (!claimed.length) throw new EcommercePaidJobError('PAID_JOB_PENDING', jobId);
        });
        submitted = true;
      } });
      await withDatabaseTransaction(async db => {
        const completed = await db.update(projectWorkflowState).set({ status: 'succeeded', selectionJson: result, updatedAt: new Date() })
          .where(and(where, eq(projectWorkflowState.id, ownerId))).returning({ id: projectWorkflowState.id });
        if (!completed.length) throw new EcommercePaidJobError('PAID_JOB_REVIEW_REQUIRED', jobId);
      });
      return { ...result, created: true };
    } catch (error) {
      const uncertain = submitted && !(error instanceof PaidSubmissionRejectedError);
      await withDatabaseTransaction(async db => {
        const owned = and(where, eq(projectWorkflowState.id, ownerId));
        if (uncertain) await db.update(projectWorkflowState).set({ status: 'needs_review', updatedAt: new Date() }).where(owned);
        else await db.delete(projectWorkflowState).where(owned);
      });
      if (uncertain) throw new EcommercePaidJobError('PAID_JOB_REVIEW_REQUIRED', jobId);
      throw error;
    }
  };
  const promise = run();
  inFlight.set(memoryKey, promise);
  try { return await promise; }
  finally { if (inFlight.get(memoryKey) === promise) inFlight.delete(memoryKey); }
}
