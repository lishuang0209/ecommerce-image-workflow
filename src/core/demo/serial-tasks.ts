import { concurrentImageLimit } from './image-generation-slots';

export async function runTasksInOrder(ids: string[], run: (id: string) => Promise<boolean>, stop: () => boolean, progress: (current: number, total: number) => void) {
  const pending = [...new Set(ids)];
  const total = pending.length;
  const succeeded: string[] = [];
  let next = 0;
  let started = 0;
  let failedId: string | null = null;
  let stopped = false;

  async function worker() {
    while (next < total && !failedId && !stop()) {
      const id = pending[next];
      next += 1;
      started += 1;
      progress(started, total);
      if (await run(id)) succeeded.push(id);
      else if (!failedId) failedId = id;
    }
    if (!failedId && stop() && next < total) stopped = true;
  }

  await Promise.all(Array.from({ length: Math.min(concurrentImageLimit, total) }, () => worker()));
  return { completed: succeeded.length, stopped: stopped && !failedId, failedId, succeeded };
}
