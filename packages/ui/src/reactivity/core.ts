import { activeEffectScope } from './effectScope.ts';
import { createReactiveSystem, ReactiveFlags, type Link, type ReactiveNode } from './system.ts';

/** A node that others read (a ref or a computed). `system.ts` calls back into these methods. */
export interface Dependency extends ReactiveNode {
  /** Applies a pending change and returns whether the value changed. */
  update(): boolean;
  /** Called when the last subscriber unlinks. */
  unwatched(): void;
}

// Our flag bits, above those of system.ts.
const PAUSED = 1 << 6;
const NOTIFIED = 1 << 7;

/** The node that reads link to: the running effect or computed. */
export let activeSub: ReactiveNode | undefined;
export let batchDepth = 0;
/** The link version of the current tracking run. */
export let cycle = 0;
/** The number of effects running, so that writes inside them are marked as recursed. */
export let runDepth = 0;

const queue: ReactiveEffect[] = [];
let flushIndex = 0;

/** The one graph instance: `link`, `unlink`, `propagate`, `checkDirty`, `shallowPropagate`. */
export const system: ReturnType<typeof createReactiveSystem> = createReactiveSystem({
  update: (node: Dependency): boolean => node.update(),
  notify(effect: ReactiveEffect): void {
    // Not notified again until it has run or found itself clean.
    effect.flags &= ~ReactiveFlags.Watching;
    queue.push(effect);
  },
  unwatched: (node: Dependency): void => node.unwatched(),
});
const { unlink, checkDirty } = system;

export function setActiveSub(sub: ReactiveNode | undefined): ReactiveNode | undefined {
  const prev = activeSub;
  activeSub = sub;
  return prev;
}

export function startBatch(): void {
  ++batchDepth;
}

export function endBatch(): void {
  if (!--batchDepth) flush();
}

/** Runs the queued effects. Called after a write when no batch is open. */
export function flush(): void {
  try {
    while (flushIndex < queue.length) queue[flushIndex++].notify();
  } finally {
    // An effect threw: the ones left keep their subscriptions and run on the next change.
    while (flushIndex < queue.length) {
      queue[flushIndex++].flags |= ReactiveFlags.Watching | ReactiveFlags.Recursed;
    }
    queue.length = flushIndex = 0;
  }
}

/** Starts a tracking run of `sub` with `flags`; reads link to it until `endTracking`. */
export function startTracking(sub: ReactiveNode, flags: number): ReactiveNode | undefined {
  ++cycle;
  sub.depsTail = undefined;
  sub.flags = flags | ReactiveFlags.RecursedCheck;
  return setActiveSub(sub);
}

/** Ends a tracking run and unlinks the deps that it did not read again. */
export function endTracking(sub: ReactiveNode, prevSub: ReactiveNode | undefined): void {
  activeSub = prevSub;
  sub.flags &= ~ReactiveFlags.RecursedCheck;
  purgeDeps(sub);
}

/** Unlinks every dep of `sub`. */
export function releaseDeps(sub: ReactiveNode): void {
  sub.depsTail = undefined;
  purgeDeps(sub);
}

function purgeDeps(sub: ReactiveNode): void {
  let dep: Link | undefined = sub.depsTail === undefined ? sub.deps : sub.depsTail.nextDep;
  while (dep !== undefined) dep = unlink(dep, sub);
}

/**
 * Runs `fn` and re-runs it when what it read changes. With a `scheduler`, a change calls the
 * scheduler instead, which decides when to `run()` (after checking `dirty`). The effect belongs
 * to the effect scope active at creation, never to an enclosing effect. Created while that scope
 * is stopped, it starts stopped.
 */
export class ReactiveEffect<T = unknown> implements ReactiveNode {
  deps: Link | undefined = undefined;
  depsTail: Link | undefined = undefined;
  flags: number = ReactiveFlags.Watching;
  fn: () => T;
  scheduler: (() => void) | undefined = undefined;
  /** Runs after `stop()`, for example a watcher's cleanups. */
  onStop: (() => void) | undefined = undefined;

  constructor(fn: () => T) {
    this.fn = fn;
    const scope = activeEffectScope;
    // Created inside a stopped scope: nothing could stop it, so it starts stopped.
    if (scope?.active) scope.effects.push(this);
    else if (scope) this.flags = ReactiveFlags.None;
  }

  /** Whether a dep changed since the last run. Recomputes stale computed deps to find out. */
  get dirty(): boolean {
    const flags = this.flags;
    if (
      flags & ReactiveFlags.Dirty ||
      (flags & ReactiveFlags.Pending && checkDirty(this.deps!, this))
    ) {
      return true;
    }
    if (flags & ReactiveFlags.Pending) {
      this.flags =
        (flags & ~(ReactiveFlags.Pending | ReactiveFlags.Recursed)) | ReactiveFlags.Watching;
    }
    return false;
  }

  run(): T {
    // A stopped effect (no flags, as in system.ts) still runs its function, but tracks nothing.
    if (!this.flags) return this.fn();
    const prev = startTracking(this, (this.flags & PAUSED) | ReactiveFlags.Watching);
    ++runDepth;
    try {
      return this.fn();
    } finally {
      --runDepth;
      endTracking(this, prev);
    }
  }

  stop(): void {
    this.flags = ReactiveFlags.None;
    releaseDeps(this);
    this.onStop?.();
  }

  pause(): void {
    if (this.flags) this.flags |= PAUSED;
  }

  resume(): void {
    const flags = this.flags;
    this.flags = flags & ~(PAUSED | NOTIFIED);
    if (flags & NOTIFIED) this.notify();
  }

  /** Reacts to a change: records it while paused, else calls the scheduler or re-runs. */
  notify(): void {
    if (this.flags & PAUSED) this.flags |= NOTIFIED;
    else if (this.scheduler) this.scheduler();
    else if (this.dirty) this.run();
  }
}
