// The compiled twin of ScopedChild.vibe, written as the compiler emits it (types added).
import {
  child,
  createComponent,
  createIf,
  insert,
  template,
  type ComponentDef,
} from '@vibejs-org/ui/internal';
import { Item } from './Item.ts';

type Props = {
  open?: boolean;
};

const t0 = template('<div class="child" data-vb-5e6f7a8b><!----></div>');
const t1 = template('<p class="child" data-vb-5e6f7a8b>Closed</p>');

export const ScopedChild: ComponentDef = {
  name: 'ScopedChild',
  __file: 'test/abi/ScopedChild.vibe',
  __scopeId: 'data-vb-5e6f7a8b',
  __propKeys: ['open'],
  render(_$setup, $props: Props) {
    return createIf(
      () => $props.open,
      () => {
        const n0 = t0() as Element;
        const a0 = child(n0);
        insert(
          createComponent(Item, { index: () => 0, label: () => 'first', done: () => false }),
          n0,
          a0,
        );
        return n0;
      },
      () => t1(),
    );
  },
};
