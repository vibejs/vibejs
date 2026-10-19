import { expectTypeOf } from 'vitest';
import type {
  ClassValue,
  HTMLAttributes,
  IntrinsicElementAttributes,
  ReservedProps,
  StyleValue,
} from './index.ts';
import { customElement, el, tags } from './tooling.ts';

// Every HTML element has attributes except <search>, which upstream lacks, and <slot>, which is a
// slot outlet in a template.
expectTypeOf<
  Exclude<keyof HTMLElementTagNameMap, keyof IntrinsicElementAttributes>
>().toEqualTypeOf<'search' | 'slot'>();

// class: a string, an array and an object form.
el(tags.div)({ class: 'a b' });
el(tags.div)({ class: ['a', { b: true }, ['c', null, false]] });
el(tags.div)({ class: { a: true, b: false } });
expectTypeOf<HTMLAttributes['class']>().toEqualTypeOf<ClassValue | undefined>();

// style: a string and a csstype object; an unknown CSS property fails.
el(tags.div)({ style: 'color: red' });
el(tags.div)({ style: { color: 'red', marginTop: 4, 'font-size': '1rem', '--gap': 2 } });
el(tags.div)({ style: [{ color: 'red' }, false, 'top: 0'] });
el(tags.div)({
  style: {
    // @ts-expect-error an unknown CSS property
    colour: 'red',
  },
});
expectTypeOf<HTMLAttributes['style']>().toEqualTypeOf<StyleValue | undefined>();

// data-* is accepted, and aria-* is typed.
el(tags.div)({ 'data-id': 1, 'data-test-name': 'x', 'aria-hidden': true, 'aria-label': 'Close' });
el(tags.div)({
  // @ts-expect-error aria-hidden is a boolean
  'aria-hidden': 'yes',
});
expectTypeOf<HTMLAttributes['aria-live']>().toEqualTypeOf<
  'off' | 'assertive' | 'polite' | undefined
>();

// Native events get their DOM event type.
el(tags.button)({
  onClick: ($event) => {
    expectTypeOf($event).toExtend<MouseEvent>();
    expectTypeOf($event).toEqualTypeOf<PointerEvent>();
  },
  onInput: ($event) => {
    expectTypeOf($event).toEqualTypeOf<InputEvent>();
  },
});

// innerHTML (v-html) and textContent (v-text) take strings.
el(tags.div)({ innerHTML: '<b>x</b>' });
el(tags.p)({ textContent: 'x' });
el(tags.div)({
  // @ts-expect-error v-html takes a string
  innerHTML: 1,
});

// Element-specific attributes and the reserved props.
el(tags.input)({ type: 'checkbox', checked: true, key: 1, ref: 'input' });
el(tags.a)({
  href: '/',
  ref: (value, refs) => {
    expectTypeOf(value).toEqualTypeOf<unknown>();
    expectTypeOf(refs).toEqualTypeOf<Record<string, unknown>>();
  },
});
el(tags.div)({
  // @ts-expect-error href is not a div attribute
  href: '/',
});
expectTypeOf<keyof ReservedProps>().toEqualTypeOf<'key' | 'ref'>();

// A custom element accepts any key, and its on* handlers get an Event.
customElement({
  size: 3,
  'any-key': { a: 1 },
  onChange: ($event) => {
    expectTypeOf($event).toEqualTypeOf<Event>();
  },
});
