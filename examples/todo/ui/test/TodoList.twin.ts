// The compiled twin of TodoList.vibe, written as the compiler emits it (types added).
import { inject, onMounted, ref } from '@vibejs-org/ui';
import {
  applyTextModel,
  child,
  createFor,
  createIf,
  insert,
  next,
  on,
  renderEffect,
  setProp,
  setText,
  template,
  toDisplayString,
  txt,
  withModifiers,
  type ComponentDef,
} from '@vibejs-org/ui/internal';
import { API } from '../src/api.ts';

type Todo = { id: string; title: string; done: boolean };

type State = {
  items: Todo[];
  title: string;
  error: { code: string } | null;
  add: () => Promise<void>;
  toggle: (id: string) => Promise<void>;
};

const t0 = template('<li><input type="checkbox"> </li>');
const t1 = template('<ul><!></ul>');
const t2 = template('<p>Nothing to do.</p>');
const t3 = template('<p class="error"> </p>');
const t4 = template(
  '<section><form><input placeholder="What next?"><button>Add</button></form><!><!></section>',
);

export const TodoList: ComponentDef = {
  name: 'TodoList',
  __file: 'ui/src/TodoList.vibe',
  setup() {
    const api = inject(API)!;
    const items = ref<Todo[]>([]);
    const title = ref('');
    const error = ref<{ code: string } | null>(null);

    async function load() {
      const r = await api.todos.list();
      if (r.ok) items.value = r.data;
      else error.value = r.error;
    }

    async function add() {
      const r = await api.todos.create({ body: { title: title.value } });
      if (r.ok) {
        items.value = [...items.value, r.data];
        title.value = '';
      } else error.value = r.error;
    }

    async function toggle(id: string) {
      const r = await api.todos.toggle({ params: { id } });
      if (r.ok) items.value = items.value.map((todo) => (todo.id === id ? r.data : todo));
      else error.value = r.error;
    }

    onMounted(() => void load());
    return { api, items, title, error, load, add, toggle };
  },
  render($setup: State) {
    const n0 = t4() as Element;
    const n1 = child(n0);
    const n2 = child(n1) as HTMLInputElement;
    const a0 = next(n1);
    const a1 = next(a0);
    on(
      n1,
      'submit',
      withModifiers(() => void $setup.add(), ['prevent']),
    );
    applyTextModel(
      n2,
      () => $setup.title,
      (v) => ($setup.title = v as string),
    );
    insert(
      createIf(
        () => $setup.items.length,
        () => {
          const n3 = t1() as Element;
          const a2 = child(n3);
          insert(
            createFor<Todo>(
              () => $setup.items,
              (item) => {
                const n4 = t0() as Element;
                const n5 = child(n4) as HTMLInputElement;
                const n6 = next(n5);
                renderEffect(() => setProp(n5, 'checked', item.value.done));
                on(n5, 'change', () => void $setup.toggle(item.value.id));
                renderEffect(() => setText(n6, ` ${toDisplayString(item.value.title)}`));
                return n4;
              },
              (todo) => todo.id,
            ),
            n3,
            a2,
          );
          return n3;
        },
        () => t2(),
      ),
      n0,
      a0,
    );
    insert(
      createIf(
        () => $setup.error,
        () => {
          const n7 = t3() as Element;
          const x0 = txt(n7);
          renderEffect(() => setText(x0, toDisplayString($setup.error?.code)));
          return n7;
        },
      ),
      n0,
      a1,
    );
    return n0;
  },
};
