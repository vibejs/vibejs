// The compiled twin of List.vibe, written as the compiler emits it (types added).
import { computed, ref } from '@vibejs-org/ui';
import {
  applyTextModel,
  child,
  createFor,
  createIf,
  insert,
  next,
  renderEffect,
  setClass,
  setText,
  template,
  toDisplayString,
  txt,
  type ComponentDef,
} from '@vibejs-org/ui/internal';

type Item = {
  id: number;
  label: string;
  done: boolean;
};

type Props = {
  title: string;
  items: Item[];
};

const t0 = template('<section class="list"><h2> </h2><input><!----></section>');
const t1 = template('<p>Nothing</p>');
const t2 = template('<ul></ul>');
const t3 = template('<li> </li>');

export const List: ComponentDef = {
  name: 'List',
  __file: 'test/abi/List.vibe',
  __propKeys: ['title', 'items'],
  setup(__props: Props) {
    const filter = ref('');
    const shown = computed(() => __props.items.filter((item) => item.label.includes(filter.value)));
    return { filter, shown };
  },
  render($setup: { filter: string; shown: Item[] }, $props: Props) {
    const n0 = t0() as Element;
    const n1 = child(n0);
    const x1 = txt(n1);
    const n2 = next(n1) as HTMLInputElement;
    const a0 = next(n2);
    renderEffect(() => setText(x1, toDisplayString($props.title)));
    applyTextModel(
      n2,
      () => $setup.filter,
      (v) => ($setup.filter = v as string),
      { trim: true },
    );
    insert(
      createIf(
        () => !$setup.shown.length,
        () => t1(),
        () => {
          const n3 = t2() as Element;
          insert(
            createFor<Item>(
              () => $setup.shown,
              (item, _key, index) => {
                const n4 = t3() as Element;
                const x4 = txt(n4);
                renderEffect(() => setClass(n4, { done: item.value.done }));
                renderEffect(() =>
                  setText(
                    x4,
                    toDisplayString(index.value + 1) + '. ' + toDisplayString(item.value.label),
                  ),
                );
                return n4;
              },
              (item) => item.id,
            ),
            n3,
          );
          return n3;
        },
      ),
      n0,
      a0,
    );
    return n0;
  },
};
