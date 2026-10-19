// Upstream: vuejs/core@bf5f0dd877dd3c23ce85c2cbc1dd771567e84c8c packages/runtime-core/src/scheduler.ts (MIT)
import { vibeError } from '../errors.gen.ts';
import { callWithErrorHandling, handleError } from './errorHandling.ts';

/**
 * A queued function. Jobs run in `id` order (none = `Infinity`): an unowned pre watcher is `-1`, an
 * owned pre watcher `uid * 2` and a render effect `uid * 2 + 1`, so parents run before children.
 * Equal ids run in `order` (none = `Infinity`), the creation sequence of render effects: an effect
 * runs before the effects it creates, so a branch swap disposes stale effects before they run.
 */
export interface SchedulerJob {
  (): void;
  id?: number;
  order?: number;
  flags?: number;
}

export const SchedulerJobFlags = {
  /** In a queue and not run yet; queueing it again does nothing. */
  QUEUED: 1,
  /** May queue itself again while it runs (watch callbacks, render effects). */
  ALLOW_RECURSE: 2,
  /** Never runs again, e.g. the job of a stopped watcher. */
  DISPOSED: 4,
} as const;

const { QUEUED, ALLOW_RECURSE, DISPOSED } = SchedulerJobFlags;
const RECURSION_LIMIT = 100;

const queue: SchedulerJob[] = [];
/** The index of the running job of `queue`, `-1` outside the main queue run. */
let flushIndex = -1;
const pendingPostFlushCbs: SchedulerJob[] = [];

const resolvedPromise = Promise.resolve();
let currentFlushPromise: Promise<void> | undefined;

const getId = (job: SchedulerJob): number => job.id ?? Infinity;

/** Whether `a` runs before `b`: a lower id, or the same id and a lower order. */
function precedes(a: SchedulerJob, b: SchedulerJob): boolean {
  const ia = getId(a);
  const ib = getId(b);
  return ia < ib || (ia === ib && (a.order ?? Infinity) < (b.order ?? Infinity));
}

/** The position after the queued jobs that `job` does not precede, so equal keys keep their order. */
function findInsertionIndex(job: SchedulerJob): number {
  let start = flushIndex + 1;
  let end = queue.length;
  while (start < end) {
    const middle = (start + end) >>> 1;
    if (precedes(job, queue[middle])) end = middle;
    else start = middle + 1;
  }
  return start;
}

/** Queues `job` for the next flush at its sorted position; a job already queued is skipped. */
export function queueJob(job: SchedulerJob): void {
  const flags = job.flags ?? 0;
  if (flags & QUEUED) return;
  const last = queue.at(-1);
  if (!last || !precedes(job, last)) queue.push(job);
  else queue.splice(findInsertionIndex(job), 0, job);
  job.flags = flags | QUEUED;
  queueFlush();
}

/** Queues callbacks that run after the main queue, deduped and sorted by id. */
export function queuePostFlushCb(cb: SchedulerJob | SchedulerJob[]): void {
  if (Array.isArray(cb)) {
    // A loop, not `push(...cb)`: spreading a large array overflows the call stack.
    for (const job of cb) pendingPostFlushCbs.push(job);
  } else if (!((cb.flags ?? 0) & QUEUED)) {
    pendingPostFlushCbs.push(cb);
    cb.flags = (cb.flags ?? 0) | QUEUED;
  }
  queueFlush();
}

function queueFlush(): void {
  currentFlushPromise ??= resolvedPromise.then(flushJobs);
}

/**
 * Resolves after the current flush, post callbacks included, or on the next microtask when
 * nothing is queued. With `fn`, resolves to what it returns, and rejects when it throws.
 */
export function nextTick<T = void, R = void>(
  this: T,
  fn?: (this: T) => R | Promise<R>,
): Promise<Awaited<R>> {
  const promise = currentFlushPromise ?? resolvedPromise;
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion, oxc/no-this-in-exported-function -- without `fn`, `R` is `void`; `nextTick.call(ctx, fn)` binds `this`
  return (fn ? promise.then(fn.bind(this)) : promise) as Promise<Awaited<R>>;
}

/** Runs the main queue, then the post callbacks, until both are empty. */
function flushJobs(): void {
  const seen = __DEV__ ? new Map<SchedulerJob, number>() : undefined;
  let cbs: SchedulerJob[] = [];
  let cbIndex = 0;
  try {
    while (queue.length || pendingPostFlushCbs.length) {
      for (flushIndex = 0; flushIndex < queue.length; flushIndex++) runJob(queue[flushIndex], seen);
      flushIndex = -1;
      queue.length = 0;
      // oxlint-disable-next-line unicorn/no-array-sort -- sorts a fresh copy; toSorted() is ES2023
      cbs = [...new Set(pendingPostFlushCbs)].sort((a, b) => getId(a) - getId(b));
      pendingPostFlushCbs.length = 0;
      for (cbIndex = 0; cbIndex < cbs.length; cbIndex++) runJob(cbs[cbIndex], seen);
    }
  } finally {
    // Work is left only when reporting an error threw (a throwing console.error): drop what ran
    // and move the rest to a new flush, so the scheduler keeps working.
    queue.splice(0, flushIndex + 1);
    flushIndex = -1;
    for (const cb of cbs.slice(cbIndex + 1)) pendingPostFlushCbs.push(cb);
    currentFlushPromise = undefined;
    if (queue.length || pendingPostFlushCbs.length) queueFlush();
  }
}

/**
 * Runs the queued post callbacks now, and those they queue, so that `app.mount()` returns after
 * the `mounted` hooks ran. Every pending post callback runs, also those queued before (such as a
 * `flush: 'post'` watcher of another app), and before the jobs of the main queue, which wait for
 * the next flush: such a callback may see the DOM before those jobs update it.
 */
export function flushPostFlushCbs(): void {
  const seen = __DEV__ ? new Map<SchedulerJob, number>() : undefined;
  while (pendingPostFlushCbs.length) {
    // oxlint-disable-next-line unicorn/no-array-sort -- sorts a fresh copy; toSorted() is ES2023
    const cbs = [...new Set(pendingPostFlushCbs)].sort((a, b) => getId(a) - getId(b));
    pendingPostFlushCbs.length = 0;
    for (const cb of cbs) runJob(cb, seen);
  }
}

function runJob(job: SchedulerJob, seen: Map<SchedulerJob, number> | undefined): void {
  const flags = job.flags ?? 0;
  // A recursive job may queue itself again while it runs; any other job is still queued then.
  const recurse = flags & ALLOW_RECURSE;
  if (recurse) job.flags = flags & ~QUEUED;
  try {
    if (!(flags & DISPOSED) && !(__DEV__ && tooManyRuns(seen!, job))) {
      callWithErrorHandling(job, null, 'scheduler flush');
    }
  } finally {
    if (!recurse) job.flags = (job.flags ?? 0) & ~QUEUED;
  }
}

/** Counts the runs of `job` in this flush; past the limit, reports VIBE5101 and skips it. */
function tooManyRuns(seen: Map<SchedulerJob, number>, job: SchedulerJob): boolean {
  const count = seen.get(job) ?? 0;
  if (count >= RECURSION_LIMIT) {
    handleError(vibeError('VIBE5101'), null, 'scheduler flush');
    return true;
  }
  seen.set(job, count + 1);
  return false;
}
