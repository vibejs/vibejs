// The compiled twin of Refs.vibe, written as the compiler emits it (types added).
import { ref, useTemplateRef, type SetupContext } from '@vibejs-org/ui';
import {
  child,
  createComponent,
  createFor,
  createIf,
  insert,
  next,
  renderEffect,
  setRef,
  setText,
  template,
  toDisplayString,
  txt,
  type ComponentDef,
} from '@vibejs-org/ui/internal';
import { Counter } from './Counter.ts';

type State = {
  items: number[];
  show: boolean;
  track: (el: unknown) => void;
};

const t0 = template('<div><!----><!----><ul></ul><p></p></div>');
const t1 = template('<input>');
const t2 = template('<li> </li>');

export const Refs: ComponentDef = {
  name: 'Refs',
  __file: 'test/abi/Refs.vibe',
  setup(_: unknown, __ctx: SetupContext) {
    const items = ref([1, 2, 3]);
    const show = ref(true);
    const input = useTemplateRef<HTMLInputElement>('input');
    const counter = useTemplateRef('counter');
    const rows = useTemplateRef<HTMLLIElement[]>('rows');
    const seen: unknown[] = [];
    function track(el: unknown) {
      seen.push(el);
    }
    __ctx.expose({ items, show, input, counter, rows, seen });
    return { items, show, input, counter, rows, seen, track };
  },
  render($setup: State) {
    const n0 = t0() as Element;
    const a0 = child(n0);
    const a1 = next(a0);
    const n1 = next(a1) as Element;
    const n2 = next(n1) as Element;
    insert(
      createIf(
        () => $setup.show,
        () => {
          const n3 = t1() as Element;
          setRef(n3, 'input');
          return n3;
        },
      ),
      n0,
      a0,
    );
    const c0 = createComponent(Counter);
    setRef(c0, 'counter');
    insert(c0, n0, a1);
    insert(
      createFor(
        () => $setup.items,
        (item) => {
          const n4 = t2() as Element;
          const x4 = txt(n4);
          setRef(n4, 'rows', true);
          renderEffect(() => setText(x4, toDisplayString(item.value)));
          return n4;
        },
        (item) => item,
      ),
      n1,
    );
    setRef(n2, $setup.track);
    return n0;
  },
};
