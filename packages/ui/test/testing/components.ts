// oxlint-disable typescript/no-empty-object-type, typescript/no-unsafe-type-assertion -- fixtures typed as C4 components
// Fixture components of the test utils, written as the compiler emits them and typed with a signature.
import { inject, reactive, ref } from '@usevibejs/ui';
import type { Component, EmitsToProps, Handle, SetupContext, Slot } from '@usevibejs/ui';
import {
  applyCheckboxModel,
  applyRadioModel,
  applySelectModel,
  applyTextModel,
  applyVShow,
  child,
  createSlot,
  insert,
  next,
  on,
  renderEffect,
  setClass,
  setText,
  template,
  toDisplayString,
  txt,
  type ComponentDef,
} from '@usevibejs/ui/internal';

type GreetingEmits = { pick: [id: string]; 'pick-item': [id: string, index: number] };
type GreetingSlots = { default?: Slot<{ count: number }>; footer?: Slot<{}> };

const t0 = template(
  '<div><h1> </h1><button type="button">Pick</button><!----><footer><!----></footer></div>',
);

/** Required and optional props, two events (one kebab-cased) and two slots. */
export const Greeting = {
  name: 'Greeting',
  __propKeys: ['name', 'count'],
  __emits: ['pick', 'pick-item'],
  __defaults: { count: () => 0 },
  render(_: unknown, $props: Record<string, unknown>, $ctx: SetupContext) {
    const n0 = t0() as Element;
    const n1 = child(n0) as Element;
    const x1 = txt(n1);
    const n2 = next(n1);
    const a0 = next(n2);
    const n3 = next(a0) as Element;
    renderEffect(() => setText(x1, `Hello ${toDisplayString($props.name)}`));
    renderEffect(() => setClass(n0, ['greeting', { active: Number($props.count) > 0 }]));
    on(n2, 'click', () => {
      $ctx.emit('pick', 'a');
      $ctx.emit('pick-item', 'b', 1);
    });
    insert(createSlot('default', { count: () => $props.count }), n0, a0);
    insert(createSlot('footer'), n3, child(n3));
    return n0;
  },
} as ComponentDef as Component<
  (
    props: { name: string; count?: number } & EmitsToProps<GreetingEmits>,
  ) => Handle<GreetingSlots, {}, GreetingEmits>
>;

const fragment = document.createElement('template');
fragment.innerHTML =
  '<p id="one" title="first">One</p><!---->text<ul hidden><li class="a b">A</li></ul><span style="display: none">B</span><i style="visibility: hidden">C</i>';

/** Several root nodes: elements, a comment anchor, text, and hidden elements. */
export const Fragment = {
  name: 'Fragment',
  render: () => [...fragment.content.cloneNode(true).childNodes],
} as ComponentDef as Component;

const nested = document.createElement('template');
nested.innerHTML = '<ul class="o"><li>a<ul class="i"><li>b</li></ul></li></ul>';

/** Nested elements of the same tag. */
export const Nested = {
  name: 'Nested',
  render: () => [...nested.content.cloneNode(true).childNodes],
} as ComponentDef as Component;

type ControlsState = { text: string; note: string; agree: boolean; size: string; tags: string[] };

const t3 = template(
  '<form><input><textarea></textarea><input type="checkbox"><input type="radio" value="s"><input type="radio" value="m"><select multiple><option value="x">X</option><option value="y">Y</option></select><select><option>red</option><option>blue</option></select><button type="button" disabled>No</button><p> </p><b>Agreed</b></form>',
);

/** Form controls bound to state that the paragraph shows as JSON. */
export const Controls = {
  name: 'Controls',
  setup() {
    return {
      state: reactive({ text: '', note: '', agree: false, size: '', tags: [], color: 'red' }),
    };
  },
  render($setup: { state: ControlsState & { color: string } }) {
    const { state } = $setup;
    const n0 = t3();
    const text = child(n0) as HTMLInputElement;
    const note = next(text) as HTMLTextAreaElement;
    const agree = next(note) as HTMLInputElement;
    const small = next(agree) as HTMLInputElement;
    const medium = next(small) as HTMLInputElement;
    const tags = next(medium) as HTMLSelectElement;
    const color = next(tags) as HTMLSelectElement;
    const button = next(color);
    const out = next(button) as Element;
    const shown = next(out) as HTMLElement;
    const x0 = txt(out);
    applyTextModel(
      text,
      () => state.text,
      (v) => (state.text = v as string),
    );
    applyTextModel(
      note,
      () => state.note,
      (v) => (state.note = v as string),
      { lazy: true },
    );
    applyCheckboxModel(
      agree,
      () => state.agree,
      (v) => (state.agree = v as boolean),
    );
    applyRadioModel(
      small,
      () => state.size,
      (v) => (state.size = v as string),
    );
    applyRadioModel(
      medium,
      () => state.size,
      (v) => (state.size = v as string),
    );
    applySelectModel(
      tags,
      () => state.tags,
      (v) => (state.tags = v as string[]),
    );
    applySelectModel(
      color,
      () => state.color,
      (v) => (state.color = v as string),
    );
    on(button, 'click', () => (state.text = 'clicked'));
    on(out, 'click', () => (state.text = 'out'));
    on(out, 'keydown', (e) => (state.text = (e as KeyboardEvent).key));
    applyVShow(shown, () => state.agree);
    renderEffect(() => setText(x0, JSON.stringify(state)));
    return n0;
  },
} as ComponentDef as Component;

const t4 = template('<p> </p>');

/** Reads what the app provides. */
export const Themed = {
  name: 'Themed',
  setup: () => ({ theme: inject('theme', 'none'), from: inject('plugin', 'none') }),
  render($setup: { theme: string; from: string }) {
    const n0 = t4();
    renderEffect(() => setText(txt(n0), `${$setup.theme} ${$setup.from}`));
    return n0;
  },
} as ComponentDef as Component;

/** A component with no name and a counter. */
export const Anonymous = {
  setup: () => ({ count: ref(0) }),
  render($setup: { count: number }) {
    const n0 = t4();
    renderEffect(() => setText(txt(n0), String($setup.count)));
    return n0;
  },
} as ComponentDef as Component;
