// The compiled twin of Hmr.vibe, written as the compiler emits it (types added).
import { ref } from '@vibejs-org/ui';
import {
  child,
  createComponent,
  insert,
  next,
  on,
  renderEffect,
  setText,
  template,
  toDisplayString,
  txt,
  type ComponentDef,
} from '@vibejs-org/ui/internal';
import { Badge } from './Badge.ts';

const t0 = template(
  '<div class="hmr" data-vb-6d7e8f90><button type="button" data-vb-6d7e8f90> </button><!----></div>',
);

export const Hmr: ComponentDef = {
  name: 'Hmr',
  __file: 'test/abi/Hmr.vibe',
  __hmrId: '6d7e8f90',
  __scopeId: 'data-vb-6d7e8f90',
  setup() {
    const count = ref(0);
    return { count };
  },
  render($setup: { count: number }) {
    const n0 = t0() as Element;
    const n1 = child(n0) as Element;
    const x1 = txt(n1);
    const a1 = next(n1);
    on(n1, 'click', () => $setup.count++);
    insert(createComponent(Badge), n0, a1);
    renderEffect(() => setText(x1, toDisplayString($setup.count)));
    return n0;
  },
};
