/** Called after local validation, immediately before a potentially billable POST. */
export type PaidSubmissionHooks = { beforeSubmit: () => Promise<void> };

/** Only an explicit upstream rejection is safe to resubmit automatically. */
export class PaidSubmissionRejectedError extends Error {}

export function isDefiniteSubmissionRejection(status: number, output: unknown) {
  return !output && [400, 401, 403, 404, 405, 413, 415, 422, 429].includes(status);
}
