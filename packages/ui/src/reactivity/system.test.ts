// @vitest-environment node
// Upstream: stackblitz/alien-signals@8734d386d925025d0e99419bd9161c17b112c5ee tests/effect.spec.ts (MIT)
// Upstream: stackblitz/alien-signals@8734d386d925025d0e99419bd9161c17b112c5ee tests/effectScope.spec.ts (MIT)
// Upstream: stackblitz/alien-signals@8734d386d925025d0e99419bd9161c17b112c5ee tests/trigger.spec.ts (MIT)
//
// Ported to ReactiveEffect, refs and effect scopes. Upstream effects own the effects created while
// they run; here an effect belongs to the active effect scope, and cleanups are registered with
// onScopeDispose. The cases that assert ownership state the scope behavior instead.
import { describe, expect, test, vi } from 'vitest';
import { computed } from './computed.ts';
import { activeSub, endBatch, ReactiveEffect, startBatch } from './core.ts';
import { effectScope, onScopeDispose } from './effectScope.ts';
import { ref, shallowRef, triggerRef } from './ref.ts';
import { ReactiveFlags } from './system.ts';

function effect(fn: () => void): ReactiveEffect<void> {
  const e = new ReactiveEffect(fn);
  e.run();
  return e;
}

describe('effect', () => {
  test('should support custom recurse effect', () => {
    const src = ref(0);
    let triggers = 0;
    effect(() => {
      activeSub!.flags &= ~ReactiveFlags.RecursedCheck;
      triggers++;
      src.value = Math.min(src.value + 1, 5);
    });
    expect(triggers).toBe(6);
  });

  test('outer re-run: an inner effect survives, owned by the scope', () => {
    const log: string[] = [];
    const a = ref(0);
    const scope = effectScope();
    scope.run(() => {
      effect(() => {
        log.push(`outer:run ${a.value}`);
        effect(() => {
          log.push(`inner:run ${a.value}`);
        });
      });
    });
    expect(log).toEqual(['outer:run 0', 'inner:run 0']);

    // The re-run happens inside scope.run(), so the scope also owns the new inner effect.
    log.length = 0;
    scope.run(() => {
      a.value = 1;
    });
    expect(log).toEqual(['outer:run 1', 'inner:run 1', 'inner:run 1']);

    log.length = 0;
    scope.stop();
    a.value = 2;
    expect(log).toEqual([]);
  });

  test('outer re-run outside any scope: the new inner effect belongs to no scope', () => {
    const a = ref(0);
    const inner: ReactiveEffect<void>[] = [];
    const scope = effectScope();
    scope.run(() => {
      effect(() => {
        void a.value;
        inner.push(effect(() => {}));
      });
    });
    a.value = 1;
    expect(inner).toHaveLength(2);
    scope.stop();
    expect(inner.map((e) => e.flags)).toEqual([ReactiveFlags.None, ReactiveFlags.Watching]);
    inner[1].stop();
  });

  test('outer re-run: a child scope per run stops the previous inner effect first', () => {
    const log: string[] = [];
    const a = ref(0);
    let child = effectScope();
    effect(() => {
      void a.value;
      child.stop();
      child = effectScope();
      child.run(() => {
        log.push('inner:run');
        effect(() => {});
        onScopeDispose(() => log.push('inner:cleanup'));
      });
    });
    log.length = 0;
    a.value = 1;
    expect(log).toEqual(['inner:cleanup', 'inner:run']);
  });

  test('scope stop: effects stop first, then cleanups run in registration order', () => {
    const log: string[] = [];
    const a = ref(0);
    const scope = effectScope();
    scope.run(() => {
      effect(() => {
        log.push(`outer:run ${a.value}`);
        effect(() => {
          log.push(`inner:run ${a.value}`);
        });
      });
      onScopeDispose(() => {
        a.value = 1;
        log.push('cleanup1');
      });
      onScopeDispose(() => log.push('cleanup2'));
    });
    log.length = 0;
    scope.stop();
    // The cleanup writes `a`, and no stopped effect re-runs.
    expect(log).toEqual(['cleanup1', 'cleanup2']);
  });

  test('scope stop: nested child scopes stop depth-first, after the parent cleanups', () => {
    const log: string[] = [];
    const scope = effectScope();
    scope.run(() => {
      effectScope().run(() => {
        effectScope().run(() => onScopeDispose(() => log.push('grandchild:cleanup')));
        onScopeDispose(() => log.push('child:cleanup'));
      });
      onScopeDispose(() => log.push('outer:cleanup'));
    });
    scope.stop();
    expect(log).toEqual(['outer:cleanup', 'child:cleanup', 'grandchild:cleanup']);
  });

  test('an effect created inside a computed getter belongs to the scope, not the computed', () => {
    const a = ref(0);
    let innerRuns = 0;
    const scope = effectScope();
    scope.run(() => {
      const c = computed(() => {
        effect(() => {
          void a.value;
          innerRuns++;
        });
        return a.value;
      });
      const reader = effect(() => {
        void c.value;
      });
      expect(innerRuns).toBe(1);
      // Losing its last subscriber releases the computed, not the effect its getter created.
      reader.stop();
      a.value = 1;
      expect(innerRuns).toBe(2);
    });
    scope.stop();
    a.value = 2;
    expect(innerRuns).toBe(2);
  });

  test('an effect created inside a computed getter survives the recompute', () => {
    const a = ref(0);
    const log: string[] = [];
    const scope = effectScope();
    scope.run(() => {
      const c = computed(() => {
        log.push('computed:eval');
        effect(() => {
          log.push('inner:run');
        });
        return a.value;
      });
      effect(() => {
        void c.value;
      });
    });
    log.length = 0;
    a.value = 1;
    expect(log).toEqual(['computed:eval', 'inner:run']);
    scope.stop();
  });

  test('outer and inner effects re-run independently', () => {
    const a = ref(0);
    const b = ref(0);
    const log: string[] = [];
    const scope = effectScope();
    scope.run(() => {
      effect(() => {
        void a.value;
        log.push('outer:run');
        effect(() => {
          void b.value;
          log.push('inner:run');
        });
      });
    });
    log.length = 0;
    b.value = 1;
    expect(log).toEqual(['inner:run']);

    log.length = 0;
    a.value = 1;
    expect(log).toEqual(['outer:run', 'inner:run']);

    log.length = 0;
    b.value = 2;
    expect(log).toEqual(['inner:run', 'inner:run']);
    scope.stop();
  });

  // https://github.com/stackblitz/alien-signals/issues/115
  test('outer effect keeps responding to its own dep after inner re-runs', () => {
    const a = ref(0);
    const b = ref(0);
    let outerRuns = 0;
    let innerRuns = 0;
    effect(() => {
      void a.value;
      outerRuns++;
      effect(() => {
        void b.value;
        innerRuns++;
      });
    });
    expect(outerRuns).toBe(1);
    expect(innerRuns).toBe(1);

    b.value = 1;
    expect(outerRuns).toBe(1);
    expect(innerRuns).toBeGreaterThanOrEqual(2);

    a.value = 1;
    expect(outerRuns).toBe(2);
  });
});

describe('effectScope', () => {
  test('scope stop stops its effects and runs their cleanups', () => {
    const log: string[] = [];
    const a = ref(0);
    const scope = effectScope();
    scope.run(() => {
      effect(() => {
        log.push(`run ${a.value}`);
      });
      onScopeDispose(() => log.push('cleanup'));
    });
    scope.stop();
    a.value = 1;
    expect(log).toEqual(['run 0', 'cleanup']);
  });

  test('scope stop: sibling cleanups run in registration order', () => {
    const log: string[] = [];
    const scope = effectScope();
    scope.run(() => {
      onScopeDispose(() => log.push('e1:cleanup'));
      onScopeDispose(() => log.push('e2:cleanup'));
      onScopeDispose(() => log.push('e3:cleanup'));
    });
    scope.stop();
    expect(log).toEqual(['e1:cleanup', 'e2:cleanup', 'e3:cleanup']);
  });

  test('scope stop reaches effects created inside nested effects', () => {
    const a = ref(0);
    let innerRuns = 0;
    const scope = effectScope();
    scope.run(() => {
      effect(() => {
        effect(() => {
          void a.value;
          innerRuns++;
        });
      });
    });
    scope.stop();
    a.value = 1;
    expect(innerRuns).toBe(1);
  });

  test('a scope created inside an effect belongs to the active scope and survives re-runs', () => {
    const a = ref(0);
    const log: string[] = [];
    const scope = effectScope();
    scope.run(() => {
      effect(() => {
        void a.value;
        log.push('outer:run');
        effectScope().run(() => onScopeDispose(() => log.push('inner:cleanup')));
      });
    });
    log.length = 0;
    scope.run(() => {
      a.value = 1;
    });
    expect(log).toEqual(['outer:run']);

    log.length = 0;
    scope.stop();
    expect(log).toEqual(['inner:cleanup', 'inner:cleanup']);
  });
});

describe('trigger', () => {
  test('should not throw when triggering with no dependencies', () => {
    expect(() => triggerRef(ref(0))).not.toThrow();
  });

  test('should trigger updates for dependent computed signals', () => {
    const arr = shallowRef<number[]>([]);
    const length = computed(() => arr.value.length);
    expect(length.value).toBe(0);
    arr.value.push(1);
    triggerRef(arr);
    expect(length.value).toBe(1);
  });

  test('should trigger updates for the second source signal', () => {
    const src1 = shallowRef<number[]>([]);
    const src2 = shallowRef<number[]>([]);
    const length = computed(() => src2.value.length);
    expect(length.value).toBe(0);
    src2.value.push(1);
    startBatch();
    triggerRef(src1);
    triggerRef(src2);
    endBatch();
    expect(length.value).toBe(1);
  });

  test('should trigger effect once', () => {
    const src1 = shallowRef<number[]>([]);
    const src2 = shallowRef<number[]>([]);
    let triggers = 0;
    effect(() => {
      triggers++;
      void src1.value;
      void src2.value;
    });
    expect(triggers).toBe(1);
    startBatch();
    triggerRef(src1);
    triggerRef(src2);
    endBatch();
    expect(triggers).toBe(2);
  });

  test('should not notify the trigger function sub', () => {
    const src1 = shallowRef<number[]>([]);
    const src2 = computed(() => src1.value);
    let triggers = 0;
    effect(() => {
      triggers++;
      void src1.value;
      void src2.value;
    });
    startBatch();
    triggerRef(src1);
    triggerRef(src2);
    endBatch();
    expect(triggers).toBe(2);
  });
});

describe('graph', () => {
  test('a dirty check stops early once a shared source marked the subscriber dirty', () => {
    const r = ref(0);
    const x = computed(() => r.value >= 0);
    const spy = vi.fn<(value?: unknown) => void>();
    // The effect reads x before r, so r's write reaches it through x first.
    effect(() => spy([x.value, r.value]));
    r.value = 1;
    expect(spy).toHaveBeenCalledTimes(2);
    expect(spy).toHaveBeenLastCalledWith([true, 1]);
  });

  test('a write inside a run to a dep not read yet in that run does not re-notify', () => {
    const a = ref(0);
    const b = ref(0);
    const spy = vi.fn<(value?: unknown) => void>();
    effect(() => {
      if (a.value === 1) b.value = 5;
      spy(b.value);
    });
    a.value = 1;
    expect(spy).toHaveBeenCalledTimes(2);
    expect(spy).toHaveBeenLastCalledWith(5);
  });
});
