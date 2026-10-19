// Upstream: vuejs/core@bf5f0dd877dd3c23ce85c2cbc1dd771567e84c8c packages/runtime-core/__tests__/apiInject.spec.ts (MIT)
//
// Components are ComponentDefs whose render returns a text node instead of vnodes. Dropped: 'bound
// to instance' (the options API `inject` option) and the warnings for provide() in a render
// function or onMounted (the instance is current there, as in setup).
import { afterEach, describe, expect, it, vi } from 'vitest';
import { warnedCodes } from '../../test/codes.ts';
import type { ComponentDef } from '../internal.ts';
import { reactive, readonly } from '../reactivity/reactive.ts';
import { ref, type Ref } from '../reactivity/ref.ts';
import { createApp } from './app.ts';
import { createComponent } from './component.ts';
import { hasInjectionContext, inject, provide, type InjectionKey } from './inject.ts';
import { renderEffect } from './renderEffect.ts';
import { nextTick } from './scheduler.ts';

afterEach(() => {
  vi.restoreAllMocks();
});

/** Mounts `def` into a new element and returns it. */
function render(def: ComponentDef): HTMLElement {
  const root = document.createElement('div');
  createApp(def).mount(root);
  return root;
}

/** A component whose setup runs `setup` and renders the text that `text()` returns. */
const comp = (setup: () => void, text: () => unknown = () => ''): ComponentDef => ({
  setup,
  render: () => {
    const node = document.createTextNode('');
    renderEffect(() => {
      node.data = String(text());
    });
    return node;
  },
});

/** A component that only renders `child`. */
const wrap = (child: ComponentDef, setup?: () => void): ComponentDef => ({
  setup,
  render: () => createComponent(child),
});

describe('provide and inject', () => {
  it('string keys', () => {
    let foo: unknown;
    const Consumer = comp(
      () => void (foo = inject('foo')),
      () => foo,
    );
    const Provider = wrap(wrap(Consumer), () => provide('foo', 1));
    expect(render(Provider).innerHTML).toBe('1');
  });

  it('symbol keys', () => {
    // also verifies InjectionKey type sync
    const key: InjectionKey<number> = Symbol();
    let foo: number | undefined;
    const Consumer = comp(
      () => void (foo = inject(key)),
      () => foo,
    );
    const Provider = wrap(wrap(Consumer), () => provide(key, 1));
    expect(render(Provider).innerHTML).toBe('1');
  });

  it('default values', () => {
    let values: unknown[] = [];
    const Consumer = comp(
      () => {
        // default value should be ignored if value is provided
        const foo = inject('foo', 'fooDefault');
        // default value should be used if value is not provided
        const bar = inject('bar', 'bar');
        // a factory default runs with the third argument
        const baz = inject('baz', () => 'baz', true);
        values = [foo, bar, baz];
      },
      () => values.join(''),
    );
    const Provider = wrap(wrap(Consumer), () => provide('foo', 'foo'));
    expect(render(Provider).innerHTML).toBe('foobarbaz');
  });

  it('nested providers', () => {
    let values: unknown[] = [];
    const Consumer = comp(
      () => void (values = [inject('foo'), inject('bar'), inject('baz')]),
      () => values.join(','),
    );
    const ProviderTwo = wrap(Consumer, () => {
      // override parent value
      provide('foo', 'fooOverride');
      provide('baz', 'baz');
    });
    const ProviderOne = wrap(ProviderTwo, () => {
      provide('foo', 'foo');
      provide('bar', 'bar');
    });
    expect(render(ProviderOne).innerHTML).toBe('fooOverride,bar,baz');
  });

  it('reactivity with refs', async () => {
    const count = ref(1);
    let injected!: Ref<number>;
    const Consumer = comp(
      () => void (injected = inject<Ref<number>>('count')!),
      () => injected.value,
    );
    const root = render(wrap(wrap(Consumer), () => provide('count', count)));
    expect(root.innerHTML).toBe('1');
    count.value++;
    await nextTick();
    expect(root.innerHTML).toBe('2');
  });

  it('reactivity with readonly refs', async () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const count = ref(1);
    let injected!: Ref<number>;
    const Consumer = comp(
      () => {
        injected = inject<Ref<number>>('count')!;
        // should not work
        injected.value++;
      },
      () => injected.value,
    );
    const root = render(wrap(wrap(Consumer), () => provide('count', readonly(count))));
    expect(root.innerHTML).toBe('1');
    expect(spy).toHaveBeenCalledTimes(1);
    count.value++;
    await nextTick();
    expect(root.innerHTML).toBe('2');
  });

  it('reactivity with objects', async () => {
    const rootState = reactive({ count: 1 });
    let state!: { count: number };
    const Consumer = comp(
      () => void (state = inject<{ count: number }>('state')!),
      () => state.count,
    );
    const root = render(wrap(wrap(Consumer), () => provide('state', rootState)));
    expect(root.innerHTML).toBe('1');
    rootState.count++;
    await nextTick();
    expect(root.innerHTML).toBe('2');
  });

  it('should warn unfound', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    let foo: unknown = 'set';
    const Consumer = comp(
      () => void (foo = inject('foo')),
      () => foo ?? '',
    );
    expect(render(wrap(wrap(Consumer))).innerHTML).toBe('');
    expect(foo).toBeUndefined();
    expect(spy).toHaveBeenCalledWith(
      expect.stringMatching(/^\[VIBE5206\] Nothing provides the injection key foo\./),
    );
    expect(warnedCodes(spy)).toContain('VIBE5206');
  });

  it('should not warn when default value is undefined', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    render(comp(() => inject('foo', undefined)));
    expect(spy).not.toHaveBeenCalled();
  });

  it('should not self-inject', () => {
    let injection: unknown;
    const Comp = comp(
      () => {
        provide('foo', 'foo');
        injection = inject('foo', null);
      },
      () => injection ?? '',
    );
    expect(render(Comp).innerHTML).toBe('');
    expect(injection).toBeNull();
  });

  it('reads the app provides from the root component', () => {
    let foo: unknown;
    const app = createApp(comp(() => void (foo = inject('foo'))));
    app.provide('foo', 'app');
    app.mount(document.createElement('div'));
    expect(foo).toBe('app');
  });

  describe('hasInjectionContext', () => {
    it('should be false outside of setup', () => {
      expect(hasInjectionContext()).toBe(false);
    });

    it('should be true within setup', () => {
      expect.assertions(1);
      render(comp(() => expect(hasInjectionContext()).toBe(true)));
    });

    it('should be true within app.runWithContext()', () => {
      expect.assertions(1);
      createApp(comp(() => {})).runWithContext(() => {
        expect(hasInjectionContext()).toBe(true);
      });
    });
  });

  describe('warnings for incorrect usage', () => {
    it('should warn when inject() is called outside setup', () => {
      const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      expect(inject('foo', 'bar')).toBeUndefined();
      expect(spy).toHaveBeenCalledWith(expect.stringMatching(/^\[VIBE5205\] inject\(\)/));
      expect(warnedCodes(spy)).toContain('VIBE5205');
    });

    it('should warn when provide() is called outside setup', () => {
      const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      provide('foo', 'bar');
      expect(spy).toHaveBeenCalledWith(expect.stringMatching(/^\[VIBE5205\] provide\(\)/));
      expect(warnedCodes(spy)).toContain('VIBE5205');
    });

    it('is silent in prod', () => {
      vi.stubGlobal('__DEV__', false);
      const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      inject('foo');
      provide('foo', 'bar');
      render(comp(() => inject('missing')));
      expect(spy).not.toHaveBeenCalled();
    });
  });
});
