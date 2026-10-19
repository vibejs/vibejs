import { afterEach, describe, expect, test, vi } from 'vitest';
import { warnedCodes } from '../../test/codes.ts';
import type { ModelRef } from '../component.ts';
import type { ComponentDef } from '../internal.ts';
import { isReactive, isReadonly } from '../reactivity/dep.ts';
import { shallowReactive } from '../reactivity/reactive.ts';
import { ref, toRefs } from '../reactivity/ref.ts';
import { createApp } from './app.ts';
import { createComponent } from './component.ts';
import type { ComponentInstance } from './instance.ts';
import { useAttrs, useModel, type RawProps } from './props.ts';
import { nextTick } from './scheduler.ts';
import { watch } from './watch.ts';

afterEach(() => {
  vi.restoreAllMocks();
});

/** Creates `def` with the raw props `raw` in a mounted app and returns its instance. */
function create(def: Partial<ComponentDef>, raw: RawProps | null = null): ComponentInstance {
  let instance!: ComponentInstance;
  createApp({
    render: () =>
      (instance = createComponent({ render: () => document.createElement('i'), ...def }, raw)),
  }).mount(document.createElement('div'));
  return instance;
}

/** A getter of a listener that does nothing. */
const noop = () => () => {};

/** `raw` with `$` sources, typed as raw props. */
// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- `$` holds sources, not getters
const withSources = (raw: object): RawProps => raw as RawProps;

describe('props', () => {
  test('route keys through __propKeys, in camelCase or hyphenated', () => {
    const { props, attrs } = create(
      { __propKeys: ['fooBar', 'flag'] },
      { 'foo-bar': () => 1, id: () => 'x' },
    );
    expect(props.fooBar).toBe(1);
    expect(props['foo-bar']).toBe(1);
    expect(props.flag).toBeUndefined();
    expect(props.id).toBeUndefined();
    expect('fooBar' in props).toBe(true);
    expect('id' in props).toBe(false);
    expect(Object.keys(props)).toEqual(['fooBar', 'flag']);
    expect(Object.getOwnPropertyDescriptor(props, 'id')).toBeUndefined();
    expect(Object.getOwnPropertyDescriptor(props, 'fooBar')).toMatchObject({
      value: 1,
      enumerable: true,
      configurable: true,
    });
    expect(Reflect.get(props, Symbol.iterator)).toBeUndefined();
    expect({ ...attrs }).toEqual({ id: 'x' });
  });

  test('read the last v-bind object that has the key, else the static getter', () => {
    const { props } = create(
      { __propKeys: ['a', 'b', 'c'] },
      withSources({
        a: () => 'static',
        c: () => 'static',
        $: [() => ({ a: 1, b: 1 }), () => null, () => ({ a: 2 })],
      }),
    );
    expect({ ...props }).toEqual({ a: 2, b: 1, c: 'static' });
  });

  test('fall back to the default for undefined, running the factory once per instance', () => {
    const factory = vi.fn<() => string[]>(() => ['default']);
    const value = ref<string[] | undefined>(undefined);
    const def = { __propKeys: ['list', 'other'], __defaults: { list: factory } };
    const { props } = create(def, { list: () => value.value });
    expect(props.list).toEqual(['default']);
    expect(props.list).toBe(props.list);
    expect(props.other).toBeUndefined();
    value.value = ['given'];
    expect(props.list).toEqual(['given']);
    value.value = undefined;
    expect(props.list).toEqual(['default']);
    expect(factory).toHaveBeenCalledTimes(1);
    expect(create(def).props.list).toEqual(['default']);
    expect(factory).toHaveBeenCalledTimes(2);
  });

  test('are reactive and readonly to watch() and toRefs()', async () => {
    const bag = shallowReactive({ count: 0 });
    const { props } = create({ __propKeys: ['count'] }, withSources({ $: [() => bag] }));
    expect(isReactive(props)).toBe(true);
    expect(isReadonly(props)).toBe(true);
    const seen: unknown[] = [];
    watch(props, (p) => seen.push(p.count));
    const { count } = toRefs(props);
    bag.count = 1;
    await nextTick();
    expect(seen).toEqual([1]);
    expect(count.value).toBe(1);
  });

  test('warn VIBE5203 on a write, silently in prod', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { props } = create({ __propKeys: ['a'] }, { a: () => 1 });
    props.a = 2;
    expect(props.a).toBe(1);
    expect(spy).toHaveBeenCalledWith(
      expect.stringMatching(/^\[VIBE5203\] Cannot assign to the prop a/),
    );
    expect(warnedCodes(spy)).toContain('VIBE5203');
    vi.stubGlobal('__DEV__', false);
    props.a = 3;
    expect(spy).toHaveBeenCalledTimes(1);
  });
});

describe('attrs', () => {
  test('hold the keys that are neither props nor listeners of declared events', () => {
    const { attrs } = create(
      { __propKeys: ['a'], __emits: ['pick', 'pick-item', 'update:modelValue', 'Raw'] },
      withSources({
        a: noop,
        onPick: noop,
        onPickItem: noop,
        'onUpdate:modelValue': noop,
        onRaw: noop,
        onOther: noop,
        online: () => true,
        $: [() => ({ title: 't', onPick: 1 })],
      }),
    );
    expect(Object.keys(attrs)).toEqual(['onOther', 'online', 'title']);
    expect('title' in attrs).toBe(true);
    expect('a' in attrs).toBe(false);
    expect(attrs.title).toBe('t');
    expect(attrs.onPick).toBeUndefined();
    expect(Reflect.get(attrs, Symbol.iterator)).toBeUndefined();
    expect(Object.getOwnPropertyDescriptor(attrs, 'title')?.value).toBe('t');
    expect(Object.getOwnPropertyDescriptor(attrs, 'a')).toBeUndefined();
  });

  test('useAttrs() returns them in setup and an empty object with VIBE5205 elsewhere', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    let seen: unknown;
    const instance = create({ setup: () => void (seen = useAttrs()) }, { id: () => 'x' });
    expect(seen).toBe(instance.attrs);
    expect(useAttrs()).toEqual({});
    expect(spy).toHaveBeenCalledWith(expect.stringMatching(/^\[VIBE5205\] useAttrs\(\)/));
    expect(warnedCodes(spy)).toContain('VIBE5205');
    vi.stubGlobal('__DEV__', false);
    useAttrs();
    expect(spy).toHaveBeenCalledTimes(1);
  });
});

describe('emit', () => {
  test('calls the listener as written or in camelCase', () => {
    const onPick = vi.fn<(...args: unknown[]) => void>();
    const onPickItem = vi.fn<(...args: unknown[]) => void>();
    const { ctx } = create(
      { __emits: ['pick', 'pick-item'] },
      { onPick: () => onPick, onPickItem: () => onPickItem },
    );
    ctx.emit('pick', 1, 2);
    ctx.emit('pick-item', 3);
    expect(onPick).toHaveBeenCalledWith(1, 2);
    expect(onPickItem).toHaveBeenCalledWith(3);
  });

  test('finds update:x listeners by the exact key, then in camelCase or hyphenated', () => {
    const exact = vi.fn<(...args: unknown[]) => void>();
    const hyphenated = vi.fn<(...args: unknown[]) => void>();
    const emits = ['update:fooBar'];
    create({ __emits: emits }, { 'onUpdate:fooBar': () => exact }).ctx.emit('update:fooBar', 1);
    create({ __emits: emits }, { 'onUpdate:foo-bar': () => hyphenated }).ctx.emit(
      'update:fooBar',
      2,
    );
    expect(exact).toHaveBeenCalledWith(1);
    expect(hyphenated).toHaveBeenCalledWith(2);
  });

  test('applies the trim and number modifiers of the model to update:x', () => {
    const onValue = vi.fn<(...args: unknown[]) => void>();
    const onModel = vi.fn<(...args: unknown[]) => void>();
    const { ctx } = create(
      { __emits: ['update:value', 'update:modelValue'] },
      {
        'onUpdate:value': () => onValue,
        valueModifiers: () => ({ trim: true, number: true }),
        'onUpdate:modelValue': () => onModel,
        modelModifiers: () => ({ trim: true }),
      },
    );
    ctx.emit('update:value', ' 1.5 ', 2);
    ctx.emit('update:modelValue', ' a ', {});
    expect(onValue).toHaveBeenCalledWith(1.5, 2);
    expect(onModel).toHaveBeenCalledWith('a', {});
  });

  test('ignores a missing or non-function listener, and modifiers that are not an object', () => {
    const { ctx } = create(
      { __emits: ['pick', 'update:x'] },
      { onPick: () => 'not a function', xModifiers: () => true },
    );
    expect(() => {
      ctx.emit('pick');
      ctx.emit('update:x', ' a ');
    }).not.toThrow();
  });

  test('routes listener errors and rejections as component event handler errors', async () => {
    const errors: [unknown, string][] = [];
    let instance!: ComponentInstance;
    const app = createApp({
      render: () =>
        (instance = createComponent(
          { __emits: ['a', 'b'], render: () => [] },
          {
            onA: () => () => {
              throw new Error('sync');
            },
            onB: () => async () => {
              throw new Error('async');
            },
          },
        )),
    });
    app.config.errorHandler = (err, _i, info) => errors.push([err, info]);
    app.mount(document.createElement('div'));
    instance.ctx.emit('a');
    instance.ctx.emit('b');
    await Promise.resolve();
    expect(errors).toEqual([
      [new Error('sync'), 'component event handler'],
      [new Error('async'), 'component event handler'],
    ]);
  });

  test('warns VIBE5202 for an undeclared event and still calls its listener, silently in prod', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const onPick = vi.fn<(...args: unknown[]) => void>();
    const { ctx } = create({ name: 'Picker' }, { onPick: () => onPick });
    ctx.emit('pick');
    expect(onPick).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith(
      expect.stringMatching(/^\[VIBE5202\] The component Picker emitted pick/),
    );
    expect(warnedCodes(spy)).toContain('VIBE5202');
    vi.stubGlobal('__DEV__', false);
    create({}).ctx.emit('pick');
    expect(spy).toHaveBeenCalledTimes(1);
  });
});

/** Creates a component whose setup calls `useModel(props, name)`. */
function model(raw: RawProps, name = 'modelValue') {
  let m!: ModelRef<unknown>;
  const instance = create(
    {
      __propKeys: [name, `${name}Modifiers`],
      __emits: [`update:${name}`],
      setup: (props) => void (m = useModel(props, name)),
    },
    raw,
  );
  return { m, instance };
}

describe('useModel', () => {
  test('keeps a local value when the parent binds neither the prop nor its listener', () => {
    const { m } = model({});
    expect(m.value).toBeUndefined();
    m.value = 'a';
    expect(m.value).toBe('a');
  });

  test('keeps a local value when the parent passes the prop but no listener', async () => {
    const value = ref('x');
    const { m } = model({ modelValue: () => value.value });
    expect(m.value).toBe('x');
    m.value = 'y';
    expect(m.value).toBe('y');
    value.value = 'z';
    await nextTick();
    expect(m.value).toBe('z');
  });

  test('emits update:<name> and follows the prop when the parent binds both', () => {
    const value = ref('x');
    const onUpdate = vi.fn<(v: string) => void>((v: string) => (value.value = v));
    const { m } = model({ title: () => value.value, 'onUpdate:title': () => onUpdate }, 'title');
    m.value = 'x';
    expect(onUpdate).not.toHaveBeenCalled();
    m.value = 'y';
    expect(onUpdate).toHaveBeenCalledWith('y');
    expect(m.value).toBe('y');
  });

  test('destructures into the ref and the modifiers', () => {
    const { m } = model({ modelModifiers: () => ({ trim: true }) });
    const [modelRef, modifiers] = m;
    expect(modelRef).toBe(m);
    expect(modifiers).toEqual({ trim: true });
  });

  test('returns a plain ref with VIBE5205 outside setup', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const m = useModel({}, 'modelValue');
    m.value = 1;
    expect(m.value).toBe(1);
    expect(spy).toHaveBeenCalledWith(expect.stringMatching(/^\[VIBE5205\] useModel\(\)/));
    expect(warnedCodes(spy)).toContain('VIBE5205');
  });
});
