// oxlint-disable typescript/no-explicit-any -- the public signatures default to `any` on purpose
import { vibeError } from '../errors.gen.ts';
import { hasChanged } from '../shared.ts';
import { warn } from '../warn.ts';
import {
  activeSub,
  cycle,
  endTracking,
  releaseDeps,
  startTracking,
  system,
  type Dependency,
} from './core.ts';
import type { Ref } from './ref.ts';
import { ReactiveFlags, type Link } from './system.ts';

const { link, checkDirty, shallowPropagate } = system;

declare const ComputedRefSymbol: unique symbol;
declare const WritableComputedRefSymbol: unique symbol;

interface BaseComputedRef<T, S = T> extends Ref<T, S> {
  /** A type-only brand. */
  [ComputedRefSymbol]: true;
}

export interface ComputedRef<T = any> extends BaseComputedRef<T> {
  readonly value: T;
}

export interface WritableComputedRef<T, S = T> extends BaseComputedRef<T, S> {
  /** A type-only brand. */
  [WritableComputedRefSymbol]: true;
}

/**
 * A value derived by `getter`. It recomputes lazily, on the first read after a dep changed, and
 * notifies its readers only when the result differs. It belongs to no effect scope: when its
 * last reader goes, it releases its deps and recomputes on the next read.
 */
export class ComputedRefImpl<T = unknown> implements Dependency {
  deps: Link | undefined = undefined;
  depsTail: Link | undefined = undefined;
  subs: Link | undefined = undefined;
  subsTail: Link | undefined = undefined;
  flags: number = ReactiveFlags.Mutable | ReactiveFlags.Dirty;
  currentValue: T | undefined = undefined;
  readonly __v_isRef = true;
  readonly getter: (oldValue: T | undefined) => T;
  readonly setter: ((value: T) => void) | undefined;

  constructor(getter: (oldValue: T | undefined) => T, setter?: (value: T) => void) {
    this.getter = getter;
    this.setter = setter;
  }

  get value(): T {
    const flags = this.flags;
    if (
      flags & ReactiveFlags.Dirty ||
      (flags & ReactiveFlags.Pending && checkDirty(this.deps!, this))
    ) {
      if (this.update() && this.subs !== undefined) shallowPropagate(this.subs);
    } else if (flags & ReactiveFlags.Pending) {
      this.flags = flags & ~ReactiveFlags.Pending;
    }
    if (activeSub !== undefined) link(this, activeSub, cycle);
    return this.currentValue!;
  }

  set value(value: T) {
    if (this.setter) this.setter(value);
    else warn(vibeError('VIBE5003'));
  }

  update(): boolean {
    const prev = startTracking(this, ReactiveFlags.Mutable);
    try {
      const oldValue = this.currentValue;
      return hasChanged(oldValue, (this.currentValue = this.getter(oldValue)));
    } finally {
      endTracking(this, prev);
    }
  }

  unwatched(): void {
    if (this.depsTail === undefined) return;
    this.flags = ReactiveFlags.Mutable | ReactiveFlags.Dirty;
    releaseDeps(this);
  }
}

export function computed<T>(getter: (oldValue: T | undefined) => T): ComputedRef<T>;
export function computed<T, S = T>(options: {
  get(oldValue: T | undefined): T;
  set(value: S): void;
}): WritableComputedRef<T, S>;
export function computed<T>(
  source:
    | ((oldValue: T | undefined) => T)
    | { get(oldValue: T | undefined): T; set(value: T): void },
): any {
  return typeof source === 'function'
    ? new ComputedRefImpl(source)
    : new ComputedRefImpl<T>(
        (oldValue) => source.get(oldValue),
        (value) => source.set(value),
      );
}
