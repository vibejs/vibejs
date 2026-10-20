// Upstream: vuejs/core@bf5f0dd877dd3c23ce85c2cbc1dd771567e84c8c packages/runtime-core/src/helpers/useTemplateRef.ts (MIT)
import type { TemplateRef } from '../component.ts';
import { vibeError } from '../errors.gen.ts';
import { onScopeDispose } from '../reactivity/effectScope.ts';
import { proxyRefs, shallowRef } from '../reactivity/ref.ts';
import { warn } from '../warn.ts';
import { callWithErrorHandling } from './errorHandling.ts';
import { ComponentInstance, currentInstance, setupInstance } from './instance.ts';

/**
 * A ref that holds the element or component that the template marks with `ref="key"`, `null`
 * until it renders and after it is removed; inside `v-for`, an array of them. A component's value
 * is what its setup passed to `defineExpose()`. A second registration of `key` warns VIBE5208.
 */
// oxlint-disable-next-line typescript/no-unnecessary-type-parameters -- C4 states `K`, which the language tools read
export function useTemplateRef<T = unknown, K extends string = string>(key: K): TemplateRef<T> {
  const r = shallowRef<T | null>(null);
  const instance = setupInstance('useTemplateRef');
  if (instance) {
    if (__DEV__ && key in instance.refs) warn(vibeError('VIBE5208', { key }), instance);
    instance.refs[key] = r;
  }
  return r;
}

/** The values of a `v-for` ref, none before its first one. */
const items = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

/**
 * `ref="key"`, `:ref="fn"` and `ref` inside `v-for` (`inFor`): sets the template ref `key` that
 * the owning component registered with `useTemplateRef('key')`, or calls `fn` with the value and
 * the owner's refs (errors go to the error handler as `'template ref'`). The value is the element,
 * or a component's exposed values with refs unwrapped. When the active scope stops, the ref is
 * reset (the value leaves the array in `v-for`) and `fn` is called with `null`. A key without a
 * registration warns VIBE5208. Codegen calls it in render, after creating the target.
 */
export function setRef(
  target: Element | ComponentInstance,
  ref: string | ((v: unknown, refs: Record<string, unknown>) => void),
  inFor = false,
): void {
  const owner = currentInstance;
  const value = target instanceof ComponentInstance ? proxyRefs(target.exposed ?? {}) : target;
  if (typeof ref === 'function') {
    const refs = proxyRefs(owner?.refs ?? {});
    const call = (v: unknown) => callWithErrorHandling(ref, owner, 'template ref', [v, refs]);
    call(value);
    onScopeDispose(() => call(null), true);
    return;
  }
  const r = owner?.refs[ref];
  if (!r) {
    if (__DEV__) warn(vibeError('VIBE5208', { key: ref }), owner);
    return;
  }
  if (inFor) {
    r.value = [...items(r.value), value];
    onScopeDispose(() => {
      r.value = items(r.value).filter((v) => v !== value);
    }, true);
  } else {
    r.value = value;
    onScopeDispose(() => {
      if (r.value === value) r.value = null;
    }, true);
  }
}
