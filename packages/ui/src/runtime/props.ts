// Upstream: vuejs/core@bf5f0dd877dd3c23ce85c2cbc1dd771567e84c8c packages/runtime-core/src/componentEmits.ts (MIT)
// Upstream: vuejs/core@bf5f0dd877dd3c23ce85c2cbc1dd771567e84c8c packages/runtime-core/src/helpers/useModel.ts (MIT)
//
// Props, attrs and emits read the getters a parent passes, so a read tracks the parent's state.
import type { EmitFn, ModelRef } from '../component.ts';
import { vibeError } from '../errors.gen.ts';
import { ref, shallowRef } from '../reactivity/ref.ts';
import {
  camelize,
  capitalize,
  hasChanged,
  hyphenate,
  isFunction,
  isObject,
  looseToNumber,
} from '../shared.ts';
import { warn } from '../warn.ts';
import { callWithAsyncErrorHandling } from './errorHandling.ts';
import { setupInstance, type ComponentInstance } from './instance.ts';
import { watchSyncEffect } from './watch.ts';

/** The props a parent passes: a getter per key, and `$` for `v-bind` objects (the last one wins, `class` and `style` merge). */
export type RawProps = Record<string, () => unknown> & { $?: (() => Record<string, unknown>)[] };

/** The `$` sources of `raw`. */
// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- `$` is the only non-getter key
const sources = (raw: RawProps | null): (() => unknown)[] =>
  (raw?.$ as (() => unknown)[] | undefined) ?? [];

/**
 * The getter of the first of `names` that `raw` holds: in the last `$` object that has one, else
 * static. `class` and `style` merge instead: the static value, then each `$` object's in order,
 * so inherited attributes (the last source) add classes and win per style key.
 */
function findRaw(raw: RawProps | null, names: readonly string[]): (() => unknown) | undefined {
  if (!raw) return undefined;
  const dynamic = sources(raw);
  const [first] = names;
  if (first === 'class' || first === 'style') {
    const values: unknown[] = Object.hasOwn(raw, first) ? [raw[first]()] : [];
    for (const get of dynamic) {
      const source = get();
      if (isObject(source) && first in source) values.push(source[first]);
    }
    if (!values.length) return undefined;
    return () => (values.length === 1 ? values[0] : values);
  }
  for (let i = dynamic.length - 1; i >= 0; i--) {
    const source = dynamic[i]();
    if (!isObject(source)) continue;
    for (const name of names) if (name in source) return () => source[name];
  }
  for (const name of names) if (name !== '$' && Object.hasOwn(raw, name)) return raw[name];
  return undefined;
}

/** Every key of `raw`, static and in `$` objects. */
function rawKeys(raw: RawProps | null): string[] {
  const keys = new Set<string>();
  for (const key in raw) if (key !== '$') keys.add(key);
  for (const source of sources(raw)) {
    const value = source();
    if (isObject(value)) for (const key in value) keys.add(key);
  }
  return [...keys];
}

const descriptor = (value: unknown): PropertyDescriptor => ({
  value,
  enumerable: true,
  configurable: true,
});

/** An enumerable, getter-backed view of the keys of `raw` that `accept` takes: attrs and slot props. */
export function rawView(
  raw: RawProps | null,
  accept: (key: string) => boolean = () => true,
): Record<string, unknown> {
  const has = (key: string | symbol): key is string =>
    typeof key === 'string' && accept(key) && !!findRaw(raw, [key]);
  return new Proxy(
    {},
    {
      get: (_, key) => (has(key) ? findRaw(raw, [key])!() : undefined),
      has: (_, key) => has(key),
      ownKeys: () => rawKeys(raw).filter((key) => accept(key)),
      getOwnPropertyDescriptor: (_, key) =>
        has(key) ? descriptor(findRaw(raw, [key])!()) : undefined,
    },
  );
}

/**
 * The props of `instance`: a key is a prop when its camelCase form is in `__propKeys`. A prop
 * reads the last `$` object that has it, else its getter (by its camelCase or hyphenated key); an
 * `undefined` value falls back to the `__defaults` factory, run once per instance. The view is
 * shallow, reactive and readonly to `watch()` and `toRefs()`; a write warns VIBE5203.
 */
export function createProps(instance: ComponentInstance): Record<string, unknown> {
  const { def, rawProps } = instance;
  const keys = new Set(def.__propKeys);
  const defaults = new Map<string, unknown>();
  const propKey = (key: string | symbol): string | undefined => {
    const camel = typeof key === 'string' ? camelize(key) : '';
    return keys.has(camel) ? camel : undefined;
  };
  const get = (key: string): unknown => {
    const value = findRaw(rawProps, [key, hyphenate(key)])?.();
    const factory = def.__defaults?.[key];
    if (value !== undefined || !factory) return value;
    if (!defaults.has(key)) defaults.set(key, factory());
    return defaults.get(key);
  };
  return new Proxy(
    {},
    {
      get: (_, key) => {
        if (key === '__v_isReactive' || key === '__v_isReadonly' || key === '__v_isShallow') {
          return true;
        }
        const prop = propKey(key);
        return prop === undefined ? undefined : get(prop);
      },
      set: (_, key) => {
        if (__DEV__) warn(vibeError('VIBE5203', { key: String(key) }), instance);
        return true;
      },
      has: (_, key) => propKey(key) !== undefined,
      ownKeys: () => [...keys],
      getOwnPropertyDescriptor: (_, key) => {
        const prop = propKey(key);
        return prop === undefined ? undefined : descriptor(get(prop));
      },
    },
  );
}

/** Whether `key` is the `on*` listener of a declared event. */
function isEmitListener(emits: readonly string[], key: string): boolean {
  if (!/^on[^a-z]/.test(key)) return false;
  const event = key.slice(2);
  return [event.charAt(0).toLowerCase() + event.slice(1), hyphenate(event), event].some((e) =>
    emits.includes(e),
  );
}

/** The attributes of `instance`: the keys a parent passes that are neither props nor declared listeners. */
export function createAttrs(instance: ComponentInstance): Record<string, unknown> {
  const keys = new Set(instance.def.__propKeys);
  const emits = instance.def.__emits ?? [];
  return rawView(
    instance.rawProps,
    (key) => !keys.has(camelize(key)) && !isEmitListener(emits, key),
  );
}

/** Whether `instance` has attributes to pass on, now or later (a `v-bind` object). */
export const hasFallthrough = (instance: ComponentInstance): boolean =>
  !!instance.rawProps?.$ || Object.keys(instance.attrs).length > 0;

/** The modifiers of the model `name`: `modelModifiers` for `modelValue`, else `<name>Modifiers`. */
function modifiersOf(instance: ComponentInstance, name: string): Record<string, unknown> {
  const names =
    name === 'modelValue'
      ? ['modelModifiers']
      : [`${name}Modifiers`, `${camelize(name)}Modifiers`, `${hyphenate(name)}Modifiers`];
  const modifiers = findRaw(instance.rawProps, names)?.();
  return isObject(modifiers) ? modifiers : {};
}

/**
 * The `emit` of `instance`: calls the parent's `on<Event>` listener (as written, camelCase, or for
 * `update:x` hyphenated) with the arguments, routing errors as `'component event handler'`.
 * `update:x` applies the `trim` and `number` modifiers of the model. An event that `__emits`
 * does not declare warns VIBE5202.
 */
export function createEmit(instance: ComponentInstance): EmitFn<Record<string, unknown[]>> {
  return (event, ...args) => {
    if (__DEV__ && !instance.def.__emits?.includes(event)) {
      warn(vibeError('VIBE5202', { name: instance.name ?? 'Anonymous', event }), instance);
    }
    const names = [`on${capitalize(event)}`, `on${capitalize(camelize(event))}`];
    let values: unknown[] = args;
    if (event.startsWith('update:')) {
      names.push(`on${capitalize(hyphenate(event))}`);
      const { trim, number } = modifiersOf(instance, event.slice(7));
      if (trim) values = values.map((a) => (typeof a === 'string' ? a.trim() : a));
      if (number) values = values.map((a) => (typeof a === 'string' ? looseToNumber(a) : a));
    }
    const handler = findRaw(instance.rawProps, names)?.();
    if (isFunction(handler)) {
      const call = (): unknown => Reflect.apply(handler, undefined, values);
      callWithAsyncErrorHandling(call, instance, 'component event handler');
    }
  };
}

/**
 * `defineModel(name)`: a ref of the prop `name` whose writes emit `update:<name>`. While the
 * parent does not bind both the prop and its `onUpdate:<name>` listener, the ref keeps the written
 * value itself. Destructuring gives the ref and the modifiers: `const [model, modifiers] = ...`.
 * Codegen emits it in setup: `const model = useModel(__props, 'modelValue')`.
 */
export function useModel(props: Record<string, unknown>, name: string): ModelRef<unknown> {
  const instance = setupInstance('useModel');
  if (!instance) {
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- outside setup, a plain ref stands in
    return ref() as ModelRef<unknown>;
  }
  const local = shallowRef<unknown>(undefined);
  watchSyncEffect(() => {
    local.value = props[name];
  });
  const names = [name, camelize(name), hyphenate(name)];
  const model = {
    __v_isRef: true,
    get value() {
      return local.value;
    },
    set value(value: unknown) {
      if (!hasChanged(value, local.value)) return;
      const bound =
        findRaw(instance.rawProps, names) &&
        findRaw(
          instance.rawProps,
          names.map((n) => `onUpdate:${n}`),
        );
      if (!bound) local.value = value;
      instance.ctx.emit(`update:${name}`, value);
    },
    *[Symbol.iterator]() {
      yield model;
      yield modifiersOf(instance, name);
    },
  };
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- a ref that also destructures
  return model as unknown as ModelRef<unknown>;
}

/** The fallthrough attributes of the component whose setup is running; VIBE5205 outside setup. */
export function useAttrs(): Record<string, unknown> {
  return setupInstance('useAttrs')?.attrs ?? {};
}
