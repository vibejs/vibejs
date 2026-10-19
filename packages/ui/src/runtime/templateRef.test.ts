import { afterEach, expect, test, vi } from 'vitest';
import { warnedCodes } from '../../test/codes.ts';
import type { TemplateRef } from '../component.ts';
import type { ComponentDef } from '../internal.ts';
import { effectScope } from '../reactivity/effectScope.ts';
import { ref } from '../reactivity/ref.ts';
import { createApp } from './app.ts';
import { createComponent } from './component.ts';
import { setRef, useTemplateRef } from './templateRef.ts';

afterEach(() => {
  vi.restoreAllMocks();
});

/** Mounts `def` and returns its app. */
function mount(def: ComponentDef) {
  const app = createApp(def);
  app.mount(document.createElement('div'));
  return app;
}

test('a component ref holds its exposed values with refs unwrapped, or an empty object', () => {
  let exposing!: TemplateRef<Record<string, unknown>>;
  let plain!: TemplateRef<Record<string, unknown>>;
  const Exposing: ComponentDef = {
    setup: (_props, ctx) => ctx.expose({ count: ref(1) }),
    render: () => [],
  };
  mount({
    setup: () => {
      exposing = useTemplateRef('exposing');
      plain = useTemplateRef('plain');
    },
    render: () => {
      const a = createComponent(Exposing);
      setRef(a, 'exposing');
      const b = createComponent({ render: () => [] });
      setRef(b, 'plain');
      return [a, b];
    },
  });
  expect(exposing.value).toEqual({ count: 1 });
  expect(plain.value).toEqual({});
});

test('keeps a ref that another element took over when the first one is removed', () => {
  let r!: TemplateRef<Element>;
  const first = effectScope();
  const second = effectScope();
  const a = document.createElement('a');
  const b = document.createElement('b');
  mount({
    setup: () => {
      r = useTemplateRef('r');
    },
    render: () => {
      first.run(() => setRef(a, 'r'));
      second.run(() => setRef(b, 'r'));
      return [];
    },
  });
  expect(r.value).toBe(b);
  first.stop();
  expect(r.value).toBe(b);
  second.stop();
  expect(r.value).toBeNull();
});

test('a function ref receives the owner refs, and its errors are routed as template ref', () => {
  const errors: [unknown, string][] = [];
  let refs: unknown;
  const scope = effectScope();
  const app = createApp({
    setup: () => void useTemplateRef('named'),
    render: () => {
      const el = document.createElement('i');
      scope.run(() => {
        setRef(el, (value, r) => {
          refs = r;
          throw new Error(value ? 'set' : 'reset');
        });
      });
      return el;
    },
  });
  app.config.errorHandler = (err, _i, info) => errors.push([err, info]);
  app.mount(document.createElement('div'));
  scope.stop();
  expect(refs).toEqual({ named: null });
  expect(errors).toEqual([
    [new Error('set'), 'template ref'],
    [new Error('reset'), 'template ref'],
  ]);
});

test('a function ref outside a component gets empty refs', () => {
  const fn = vi.fn<(...args: unknown[]) => void>();
  const scope = effectScope();
  const el = document.createElement('i');
  scope.run(() => setRef(el, fn));
  scope.stop();
  expect(fn.mock.calls).toEqual([
    [el, {}],
    [null, {}],
  ]);
});

test('warns VIBE5208 for a duplicate key and for a key without useTemplateRef, silently in prod', () => {
  const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  mount({
    setup: () => {
      useTemplateRef('twice');
      useTemplateRef('twice');
    },
    render: () => {
      const el = document.createElement('i');
      setRef(el, 'missing');
      return el;
    },
  });
  expect(spy.mock.calls.map(([m]) => String(m).split('\n', 1)[0])).toEqual([
    '[VIBE5208] The template ref twice is registered twice, or a template uses it without a matching useTemplateRef().',
    '[VIBE5208] The template ref missing is registered twice, or a template uses it without a matching useTemplateRef().',
  ]);
  expect(warnedCodes(spy)).toContain('VIBE5208');
  const outside = effectScope();
  outside.run(() => setRef(document.createElement('i'), 'nowhere'));
  outside.stop();
  expect(spy).toHaveBeenCalledTimes(3);
  vi.stubGlobal('__DEV__', false);
  mount({
    setup: () => {
      useTemplateRef('twice');
      useTemplateRef('twice');
    },
    render: () => [],
  });
  expect(spy).toHaveBeenCalledTimes(3);
});

test('useTemplateRef() outside setup returns a ref that stays null, with VIBE5205', () => {
  const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  expect(useTemplateRef('x').value).toBeNull();
  expect(spy).toHaveBeenCalledWith(expect.stringMatching(/^\[VIBE5205\] useTemplateRef\(\)/));
  expect(warnedCodes(spy)).toContain('VIBE5205');
});
