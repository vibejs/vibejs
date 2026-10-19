import { ReactiveEffect } from '../reactivity/core.ts';
import { callWithErrorHandling } from './errorHandling.ts';
import { queueJob, SchedulerJobFlags, type SchedulerJob } from './scheduler.ts';

/**
 * Runs `fn` now and again in the next flush after what it read changes. Codegen wraps each
 * dynamic binding in one render effect (an interpolation is one text node plus one effect), and
 * calls it while the block that owns it is built: the effect stops with the active effect scope.
 * Errors go to the error handler as `'render effect'`. `loc` is the dev-only source position,
 * `'src/A.vibe:12:5'`.
 */
// oxlint-disable-next-line eslint/no-unused-vars -- C3 states `loc`; the dev tools read it later
export function renderEffect(fn: () => void, loc?: string): void {
  const effect = new ReactiveEffect(() => callWithErrorHandling(fn, 'render effect'));
  const job: SchedulerJob = () => {
    if (effect.dirty) effect.run();
  };
  job.flags = SchedulerJobFlags.ALLOW_RECURSE;
  effect.scheduler = () => queueJob(job);
  effect.onStop = () => {
    job.flags! |= SchedulerJobFlags.DISPOSED;
  };
  effect.run();
}
