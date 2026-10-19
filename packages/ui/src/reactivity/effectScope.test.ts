// @vitest-environment node
// Upstream: vuejs/core@bf5f0dd877dd3c23ce85c2cbc1dd771567e84c8c packages/reactivity/__tests__/effectScope.spec.ts (MIT)
//
// on()/off() are not part of this API.
import { afterEach, describe, expect, it, test, vi } from 'vitest';
import { vibeError } from '../errors.gen.ts';
import { computed } from './computed.ts';
import { ReactiveEffect } from './core.ts';
import {
  effectScope,
  EffectScopeImpl,
  getCurrentScope,
  onScopeDispose,
  type EffectScope,
} from './effectScope.ts';
import { isProxy, reactive } from './reactive.ts';
import { ref } from './ref.ts';
import { nextTick } from '../runtime/scheduler.ts';
import { watch, watchEffect } from '../runtime/watch.ts';

function effect(fn: () => unknown): ReactiveEffect {
  const e = new ReactiveEffect(fn);
  e.run();
  return e;
}

const impl = (scope: EffectScope): EffectScopeImpl => {
  if (!(scope instanceof EffectScopeImpl)) throw new TypeError('not an effect scope');
  return scope;
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe('reactivity/effect/scope', () => {
  it('should run', () => {
    const fnSpy = vi.fn<() => void>(() => {});
    effectScope().run(fnSpy);
    expect(fnSpy).toHaveBeenCalledTimes(1);
  });

  it('should accept zero argument', () => {
    const scope = impl(effectScope());
    expect(scope.effects.length).toBe(0);
  });

  it('should return run value', () => {
    expect(effectScope().run(() => 1)).toBe(1);
  });

  it('should work w/ active property', () => {
    const scope = effectScope();
    scope.run(() => 1);
    expect(scope.active).toBe(true);
    scope.stop();
    expect(scope.active).toBe(false);
  });

  it('should collect the effects', () => {
    const scope = impl(effectScope());
    scope.run(() => {
      let dummy;
      const counter = reactive({ num: 0 });
      effect(() => (dummy = counter.num));

      expect(dummy).toBe(0);
      counter.num = 7;
      expect(dummy).toBe(7);
    });

    expect(scope.effects.length).toBe(1);
  });

  it('stop', () => {
    let dummy, doubled;
    const counter = reactive({ num: 0 });

    const scope = impl(effectScope());
    scope.run(() => {
      effect(() => (dummy = counter.num));
      effect(() => (doubled = counter.num * 2));
    });

    expect(scope.effects.length).toBe(2);

    expect(dummy).toBe(0);
    counter.num = 7;
    expect(dummy).toBe(7);
    expect(doubled).toBe(14);

    scope.stop();

    counter.num = 6;
    expect(dummy).toBe(7);
    expect(doubled).toBe(14);
  });

  it('should collect nested scope', () => {
    let dummy, doubled;
    const counter = reactive({ num: 0 });

    const scope = impl(effectScope());
    scope.run(() => {
      effect(() => (dummy = counter.num));
      // nested scope
      effectScope().run(() => {
        effect(() => (doubled = counter.num * 2));
      });
    });

    expect(scope.effects.length).toBe(1);
    expect(scope.scopes.length).toBe(1);
    expect(scope.scopes[0]).toBeInstanceOf(EffectScopeImpl);

    expect(dummy).toBe(0);
    counter.num = 7;
    expect(dummy).toBe(7);
    expect(doubled).toBe(14);

    // stop the nested scope as well
    scope.stop();

    counter.num = 6;
    expect(dummy).toBe(7);
    expect(doubled).toBe(14);
  });

  it('nested scope can be escaped', () => {
    let dummy, doubled;
    const counter = reactive({ num: 0 });

    const scope = impl(effectScope());
    scope.run(() => {
      effect(() => (dummy = counter.num));
      // nested scope
      effectScope(true).run(() => {
        effect(() => (doubled = counter.num * 2));
      });
    });

    expect(scope.effects.length).toBe(1);

    expect(dummy).toBe(0);
    counter.num = 7;
    expect(dummy).toBe(7);
    expect(doubled).toBe(14);

    scope.stop();

    counter.num = 6;
    expect(dummy).toBe(7);

    // nested scope should not be stopped
    expect(doubled).toBe(12);
  });

  it('able to run the scope', () => {
    let dummy, doubled;
    const counter = reactive({ num: 0 });

    const scope = impl(effectScope());
    scope.run(() => {
      effect(() => (dummy = counter.num));
    });

    expect(scope.effects.length).toBe(1);

    scope.run(() => {
      effect(() => (doubled = counter.num * 2));
    });

    expect(scope.effects.length).toBe(2);

    counter.num = 7;
    expect(dummy).toBe(7);
    expect(doubled).toBe(14);

    scope.stop();
  });

  it('can not run an inactive scope', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    let dummy, doubled;
    const counter = reactive({ num: 0 });

    const scope = impl(effectScope());
    scope.run(() => {
      effect(() => (dummy = counter.num));
    });

    expect(scope.effects.length).toBe(1);

    scope.stop();

    expect(
      scope.run(() => {
        effect(() => (doubled = counter.num * 2));
      }),
    ).toBeUndefined();

    expect(warn).toHaveBeenCalledWith(vibeError('VIBE5005').message);

    expect(scope.effects.length).toBe(0);

    counter.num = 7;
    expect(dummy).toBe(0);
    expect(doubled).toBe(undefined);
  });

  it('should fire onScopeDispose hook', () => {
    let dummy = 0;

    const scope = effectScope();
    scope.run(() => {
      onScopeDispose(() => (dummy += 1));
      onScopeDispose(() => (dummy += 2));
    });

    scope.run(() => {
      onScopeDispose(() => (dummy += 4));
    });

    expect(dummy).toBe(0);

    scope.stop();
    expect(dummy).toBe(7);
  });

  it('should warn onScopeDispose() is called when there is no active effect scope', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const spy = vi.fn<(value?: unknown) => void>();
    const scope = effectScope();
    scope.run(() => {
      onScopeDispose(spy);
    });

    expect(spy).toHaveBeenCalledTimes(0);

    onScopeDispose(spy);

    expect(warn).toHaveBeenCalledWith(vibeError('VIBE5006', { api: 'onScopeDispose' }).message);

    scope.stop();
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('should dereference child scope from parent scope after stopping child scope (no memleaks)', () => {
    const parent = impl(effectScope());
    const child = parent.run(() => effectScope())!;
    expect(parent.scopes.includes(impl(child))).toBe(true);
    child.stop();
    expect(parent.scopes.includes(impl(child))).toBe(false);
  });

  it('test with higher level APIs', async () => {
    const r = ref(1);

    const computedSpy = vi.fn<(value?: unknown) => void>();
    const watchSpy = vi.fn<(value?: unknown) => void>();
    const watchEffectSpy = vi.fn<(value?: unknown) => void>();

    const scope = effectScope();
    scope.run(() => {
      const c = computed(() => {
        computedSpy();
        return r.value + 1;
      });

      watch(r, watchSpy);
      watchEffect(() => {
        watchEffectSpy();
        void r.value;
        void c.value;
      });
    });

    expect(computedSpy).toHaveBeenCalledTimes(1);
    expect(watchSpy).toHaveBeenCalledTimes(0);
    expect(watchEffectSpy).toHaveBeenCalledTimes(1);

    r.value++;
    await nextTick();
    expect(computedSpy).toHaveBeenCalledTimes(2);
    expect(watchSpy).toHaveBeenCalledTimes(1);
    expect(watchEffectSpy).toHaveBeenCalledTimes(2);

    scope.stop();

    r.value++;
    await nextTick();
    // should not trigger anymore
    expect(computedSpy).toHaveBeenCalledTimes(2);
    expect(watchSpy).toHaveBeenCalledTimes(1);
    expect(watchEffectSpy).toHaveBeenCalledTimes(2);
  });

  it('getCurrentScope() stays valid when running a detached nested EffectScope', () => {
    const parentScope = effectScope();

    parentScope.run(() => {
      const currentScope = getCurrentScope();
      expect(currentScope).toBeDefined();
      const detachedScope = effectScope(true);
      detachedScope.run(() => {});

      expect(getCurrentScope()).toBe(currentScope);
    });
  });

  it('should pause/resume EffectScope', () => {
    const counter = reactive({ num: 0 });
    const fnSpy = vi.fn<() => number>(() => counter.num);
    const scope = effectScope();
    scope.run(() => {
      effect(fnSpy);
    });

    expect(fnSpy).toHaveBeenCalledTimes(1);

    counter.num++;
    expect(fnSpy).toHaveBeenCalledTimes(2);

    scope.pause();
    counter.num++;
    expect(fnSpy).toHaveBeenCalledTimes(2);

    counter.num++;
    expect(fnSpy).toHaveBeenCalledTimes(2);

    scope.resume();
    expect(fnSpy).toHaveBeenCalledTimes(3);
  });

  test('removing a watcher while stopping its effectScope', async () => {
    const count = ref(0);
    const scope = effectScope();
    let watcherCalls = 0;
    let cleanupCalls = 0;

    scope.run(() => {
      const stop1 = watch(count, () => {
        watcherCalls++;
      });
      watch(count, (val, old, onCleanup) => {
        watcherCalls++;
        onCleanup(() => {
          cleanupCalls++;
          stop1();
        });
      });
      watch(count, () => {
        watcherCalls++;
      });
    });

    expect(watcherCalls).toBe(0);
    expect(cleanupCalls).toBe(0);

    count.value++;
    await nextTick();
    expect(watcherCalls).toBe(3);
    expect(cleanupCalls).toBe(0);

    scope.stop();
    count.value++;
    await nextTick();
    expect(watcherCalls).toBe(3);
    expect(cleanupCalls).toBe(1);

    expect(impl(scope).effects.length).toBe(0);
    expect(impl(scope).cleanups.length).toBe(0);
  });

  it('should still trigger updates after stopping scope stored in reactive object', () => {
    const rs = ref({
      stage: 0,
      scope: null as EffectScope | null,
    });

    let renderCount = 0;
    effect(() => {
      renderCount++;
      return rs.value.stage;
    });

    const handleBegin = () => {
      const status = rs.value;
      status.stage = 1;
      status.scope = effectScope();
      status.scope.run(() => {
        watch([() => status.stage], () => {});
      });
    };

    const handleExit = () => {
      const status = rs.value;
      status.stage = 0;
      const watchScope = status.scope;
      status.scope = null;
      watchScope?.stop();
    };

    expect(rs.value.stage).toBe(0);
    expect(renderCount).toBe(1);

    // 1. Click begin
    handleBegin();
    expect(rs.value.stage).toBe(1);
    expect(renderCount).toBe(2);
    // The stored scope stays raw.
    expect(isProxy(rs.value.scope)).toBe(false);

    // 2. Click add
    rs.value.stage++;
    expect(rs.value.stage).toBe(2);
    expect(renderCount).toBe(3);

    // 3. Click end
    handleExit();
    expect(rs.value.stage).toBe(0);
    expect(renderCount).toBe(4);

    handleBegin();
    expect(rs.value.stage).toBe(1);
    expect(renderCount).toBe(5);
  });

  it('should stop child scopes when cleanup stops a sibling scope', () => {
    const parent = effectScope();
    let sibling!: EffectScope;

    parent.run(() => {
      effectScope().run(() => {
        onScopeDispose(() => sibling.stop());
      });
      sibling = effectScope();
    });

    expect(() => parent.stop()).not.toThrow();
    expect(sibling.active).toBe(false);
  });

  it('should resume effects when a watcher stops a sibling watcher', () => {
    const count = ref(0);
    const scope = effectScope();
    let stopSecond: (() => void) | undefined;
    const firstSpy = vi.fn<(value?: unknown) => void>(() => stopSecond?.());
    const secondSpy = vi.fn<(value?: unknown) => void>();

    scope.run(() => {
      watch(count, firstSpy, { flush: 'sync' });
      stopSecond = watch(count, secondSpy, { flush: 'sync' });
    });

    scope.pause();
    count.value++;

    expect(() => scope.resume()).not.toThrow();
    expect(firstSpy).toHaveBeenCalledTimes(1);
    expect(secondSpy).not.toHaveBeenCalled();
    expect(impl(scope).effects).toHaveLength(1);
  });
});

describe('effectScope', () => {
  test('stop() stops owned effects and child scopes and runs the cleanups once', () => {
    const counter = ref(0);
    const runs = vi.fn<(value?: unknown) => void>();
    const cleanup = vi.fn<(value?: unknown) => void>();
    const scope = effectScope();
    scope.run(() => {
      effect(() => runs(counter.value));
      onScopeDispose(cleanup);
      effectScope().run(() => effect(() => runs(counter.value)));
    });
    scope.stop();
    scope.stop();
    counter.value++;
    expect(runs).toHaveBeenCalledTimes(2);
    expect(cleanup).toHaveBeenCalledTimes(1);
  });

  test('an effect created inside an effect belongs to the scope and survives the outer re-run', () => {
    const outer = ref(0);
    const inner = ref(0);
    const innerRuns = vi.fn<(value?: unknown) => void>();
    const scope = impl(effectScope());
    scope.run(() => {
      effect(() => {
        if (outer.value === 0) effect(() => innerRuns(inner.value));
      });
      outer.value = 1;
    });
    expect(scope.effects).toHaveLength(2);

    inner.value = 1;
    expect(innerRuns).toHaveBeenCalledTimes(2);

    scope.stop();
    inner.value = 2;
    expect(innerRuns).toHaveBeenCalledTimes(2);
  });

  test('a detached scope is not stopped by its parent', () => {
    const parent = effectScope();
    const detached = parent.run(() => effectScope(true))!;
    parent.stop();
    expect(detached.active).toBe(true);
    expect(impl(detached).parent).toBeUndefined();
  });

  test('stopping a child swaps the last sibling into its slot', () => {
    const parent = impl(effectScope());
    const [a, b, c] = parent.run(() => [effectScope(), effectScope(), effectScope()])!;
    a.stop();
    expect(parent.scopes).toEqual([c, b]);
    expect(impl(c).index).toBe(0);
    c.stop();
    expect(parent.scopes).toEqual([b]);
  });

  test('pause() holds owned effects of nested scopes; resume() replays each once', () => {
    const counter = ref(0);
    const spy = vi.fn<(value?: unknown) => void>();
    const quiet = vi.fn<(value?: unknown) => void>();
    const other = ref(0);
    const scope = effectScope();
    scope.run(() => {
      effectScope().run(() => effect(() => spy(counter.value)));
      effect(() => quiet(other.value));
    });

    scope.pause();
    counter.value++;
    counter.value++;
    expect(spy).toHaveBeenCalledTimes(1);

    scope.resume();
    expect(spy).toHaveBeenCalledTimes(2);
    expect(spy).toHaveBeenLastCalledWith(2);
    // An effect with no recorded change does not run on resume.
    expect(quiet).toHaveBeenCalledTimes(1);

    counter.value++;
    expect(spy).toHaveBeenCalledTimes(3);
  });

  test('resume() leaves an effect paused on its own paused unless the scope was paused', () => {
    const counter = ref(0);
    const runs = vi.fn<(value?: unknown) => void>();
    const scope = effectScope();
    const e = scope.run(() => effect(() => runs(counter.value)))!;
    e.pause();
    counter.value++;
    scope.resume();
    expect(runs).toHaveBeenCalledTimes(1);
    e.resume();
    expect(runs).toHaveBeenCalledTimes(2);
  });

  test('pause() and resume() on a stopped scope do nothing', () => {
    const counter = ref(0);
    const runs = vi.fn<(value?: unknown) => void>();
    const paused = impl(effectScope());
    paused.run(() => effect(() => runs(counter.value)));
    paused.pause();
    paused.stop();
    paused.resume();
    expect(paused.paused).toBe(true);
    const stopped = impl(effectScope());
    stopped.stop();
    stopped.pause();
    expect(stopped.paused).toBe(false);
    counter.value++;
    expect(runs).toHaveBeenCalledTimes(1);
  });

  test('an effect created inside a stopped scope starts stopped and is not owned', () => {
    const counter = ref(0);
    const runs = vi.fn<(value?: unknown) => void>();
    const scope = impl(effectScope());
    scope.run(() => {
      scope.stop();
      effect(() => runs(counter.value));
    });
    expect(scope.effects).toHaveLength(0);
    counter.value++;
    expect(runs).toHaveBeenCalledTimes(1);
  });

  test('a scope created inside a stopped scope starts stopped and runs nothing, silently', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const fn = vi.fn<() => void>();
    const parent = impl(effectScope());
    const child = parent.run(() => {
      parent.stop();
      return impl(effectScope());
    })!;
    expect(child.active).toBe(false);
    expect(child.parent).toBeUndefined();
    expect(parent.scopes).toHaveLength(0);
    expect(child.run(fn)).toBeUndefined();
    expect(fn).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
  });

  test('getCurrentScope() returns the running scope', () => {
    expect(getCurrentScope()).toBeUndefined();
    const scope = effectScope();
    scope.run(() => {
      expect(getCurrentScope()).toBe(scope);
      const child = effectScope();
      child.run(() => expect(getCurrentScope()).toBe(child));
      expect(getCurrentScope()).toBe(scope);
    });
    expect(getCurrentScope()).toBeUndefined();
  });

  test('run() restores the previous scope when the function throws', () => {
    const scope = effectScope();
    expect(() =>
      scope.run(() => {
        throw new Error('boom');
      }),
    ).toThrow('boom');
    expect(getCurrentScope()).toBeUndefined();
  });

  test('onScopeDispose(fn, true) with no active scope does not warn', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    onScopeDispose(() => {}, true);
    expect(warn).not.toHaveBeenCalled();
  });

  test('warnings are dev-only', () => {
    vi.stubGlobal('__DEV__', false);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const scope = effectScope();
    scope.stop();
    scope.run(() => {});
    onScopeDispose(() => {});
    expect(warn).not.toHaveBeenCalled();
  });
});
