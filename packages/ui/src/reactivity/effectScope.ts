import { vibeError } from '../errors.gen.ts';
import { warn } from '../warn.ts';

export interface EffectScope {
  readonly active: boolean;
  /** Runs `fn` with this scope active, so that the effects and scopes it creates belong to it. */
  run<T>(fn: () => T): T | undefined;
  /** Stops every owned effect and child scope, then runs the cleanups. */
  stop(): void;
  /** Holds the owned effects: they record changes instead of running. */
  pause(): void;
  /** Releases the owned effects; each one that recorded a change runs once. */
  resume(): void;
}

/** What a scope needs from an owned effect (`ReactiveEffect` in `core.ts`). */
interface OwnedEffect {
  stop(): void;
  pause(): void;
  resume(): void;
}

/** The scope that new effects and non-detached scopes register with. */
export let activeEffectScope: EffectScopeImpl | undefined;

export class EffectScopeImpl implements EffectScope {
  active = true;
  /** Whether `run()` on this inactive scope warns: not when it was created inside a stopped one. */
  warnOnRun = true;
  paused = false;
  readonly detached: boolean;
  /** A scope stored in a reactive object stays raw, so that `run()` registers on the scope itself. */
  readonly __v_skip = true;
  effects: OwnedEffect[] = [];
  cleanups: (() => void)[] = [];
  scopes: EffectScopeImpl[] = [];
  parent: EffectScopeImpl | undefined;
  /** The position in `parent.scopes`, for O(1) removal. */
  index = 0;

  constructor(detached = false) {
    this.detached = detached;
    const parent = activeEffectScope;
    if (detached || !parent) return;
    if (parent.active) {
      this.parent = parent;
      this.index = parent.scopes.push(this) - 1;
    } else {
      // Created inside a stopped scope: nothing could stop it, so it starts stopped.
      this.active = this.warnOnRun = false;
    }
  }

  run<T>(fn: () => T): T | undefined {
    if (!this.active) {
      if (this.warnOnRun) warn(vibeError('VIBE5005'));
      return undefined;
    }
    const prev = activeEffectScope;
    // oxlint-disable-next-line typescript/no-this-alias -- the active scope is module state
    activeEffectScope = this;
    try {
      return fn();
    } finally {
      activeEffectScope = prev;
    }
  }

  stop(fromParent?: boolean): void {
    if (!this.active) return;
    this.active = false;
    for (const effect of this.effects) effect.stop();
    this.effects.length = 0;
    for (const cleanup of this.cleanups) cleanup();
    this.cleanups.length = 0;
    // A copy: a cleanup of one child may stop a sibling, which removes it from `scopes`.
    for (const scope of this.scopes.slice()) scope.stop(true);
    this.scopes.length = 0;
    const parent = this.parent;
    if (parent && !fromParent) {
      const last = parent.scopes.pop()!;
      if (last !== this) {
        parent.scopes[this.index] = last;
        last.index = this.index;
      }
    }
    this.parent = undefined;
  }

  pause(): void {
    if (!this.active) return;
    this.paused = true;
    for (const scope of this.scopes) scope.pause();
    for (const effect of this.effects) effect.pause();
  }

  resume(): void {
    // Only a paused scope resumes, so an effect paused on its own stays paused.
    if (!this.active || !this.paused) return;
    this.paused = false;
    // Copies: a resumed effect may stop a sibling effect or scope.
    for (const scope of this.scopes.slice()) scope.resume();
    for (const effect of this.effects.slice()) effect.resume();
  }
}

/** Creates a scope. A detached scope is not owned by the active scope. */
export function effectScope(detached?: boolean): EffectScope {
  return new EffectScopeImpl(detached);
}

export function getCurrentScope(): EffectScope | undefined {
  return activeEffectScope;
}

/** Registers `fn` to run when the active scope stops; warns VIBE5006 when there is none. */
export function onScopeDispose(fn: () => void, failSilently = false): void {
  if (activeEffectScope) activeEffectScope.cleanups.push(fn);
  else if (!failSilently) warn(vibeError('VIBE5006', { api: 'onScopeDispose' }));
}
