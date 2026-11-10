import { ApiError } from './api-client';

export function paidJobErrorKey(error: unknown): 'paidJobPending' | 'paidJobReviewRequired' | null {
  if (!(error instanceof ApiError)) return null;
  const code = (error.data as { code?: string } | null)?.code;
  if (code === 'PAID_JOB_PENDING') return 'paidJobPending';
  if (code === 'PAID_JOB_REVIEW_REQUIRED') return 'paidJobReviewRequired';
  return null;
}
