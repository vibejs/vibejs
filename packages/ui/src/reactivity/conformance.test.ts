// @vitest-environment node
// Upstream: stackblitz/alien-signals@8734d386d925025d0e99419bd9161c17b112c5ee tests/conformance.spec.ts (MIT)
import { setExpect, testSuite, type ReactiveFramework } from 'reactive-framework-test-suite';
import { describe, expect, test } from 'vitest';
import { onWatcherCleanup, watchSyncEffect } from '../runtime/watch.ts';
import { computed } from './computed.ts';
import { endBatch, setActiveSub, startBatch } from './core.ts';
import { effectScope } from './effectScope.ts';
import { shallowRef } from './ref.ts';

function untracked<T>(fn: () => T): T {
  const prev = setActiveSub(undefined);
  try {
    return fn();
  } finally {
    setActiveSub(prev);
  }
}

const framework: ReactiveFramework = {
  signal(initialValue) {
    const signal = shallowRef(initialValue);
    return {
      read: () => signal.value,
      write: (value) => {
        signal.value = value;
      },
    };
  },
  computed(fn) {
    const c = computed(fn);
    return { read: () => c.value };
  },
  // The cleanup that `fn` may return is a watcher cleanup: it runs, untracked, before the next run
  // and when the watcher or its scope stops.
  effect: (fn) =>
    watchSyncEffect(() => {
      const cleanup = fn();
      if (cleanup) onWatcherCleanup(cleanup);
    }),
  run(fn) {
    const scope = effectScope();
    scope.run(fn);
    scope.stop();
  },
  batch(fn) {
    startBatch();
    try {
      fn();
    } finally {
      endBatch();
    }
  },
  untracked,
};

/**
 * Cases whose expected behavior differs from this layer's ownership model, in which an effect
 * belongs to the effect scope that is active when it is created, never to an enclosing effect.
 */
const ownership = new Set([
  // Stopping an effect stops only that effect. The effects created while it ran belong to the
  // active scope and stop with that scope.
  '#209 three-level nested effect: cascading disposal',
  // A re-run keeps the effects that the previous run created: they belong to the active scope, so
  // the old and the new inner effects all react until that scope stops.
  '#210 multiple inner effects all cleaned when outer re-runs',
]);

setExpect(expect);

for (const { section, cases } of testSuite) {
  // oxlint-disable-next-line vitest/valid-title -- the suite names its sections
  describe(section, () => {
    for (const [name, fn] of Object.entries(cases)) {
      // oxlint-disable-next-line vitest/valid-title, vitest/expect-expect -- the suite names and asserts its cases
      test.skipIf(ownership.has(name))(name, () => {
        framework.run(() => fn(framework));
      });
    }
  });
}
