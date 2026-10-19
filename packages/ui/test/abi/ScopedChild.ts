// The compiled twin of ScopedChild.vibe, written as the compiler emits it (types added).
import {
  child,
  createComponent,
  insert,
  template,
  type ComponentDef,
} from '@vibejs-org/ui/internal';
import { Item } from './Item.ts';

const t0 = template('<div class="child" data-vb-5e6f7a8b><!----></div>');

export const ScopedChild: ComponentDef = {
  name: 'ScopedChild',
  __file: 'test/abi/ScopedChild.vibe',
  __scopeId: 'data-vb-5e6f7a8b',
  render() {
    const n0 = t0() as Element;
    const a0 = child(n0);
    insert(
      createComponent(Item, { index: () => 0, label: () => 'first', done: () => false }),
      n0,
      a0,
    );
    return n0;
  },
};
