// The compiled twin of Card.vibe, written as the compiler emits it (types added).
import { ref } from '@vibejs-org/ui';
import {
  child,
  createSlot,
  insert,
  next,
  on,
  template,
  type ComponentDef,
} from '@vibejs-org/ui/internal';

const t0 = template(
  '<article><header><!----></header><button type="button">More</button><!----><footer><!----></footer></article>',
);
const t1 = template('Untitled');

export const Card: ComponentDef = {
  name: 'Card',
  __file: 'test/abi/Card.vibe',
  setup() {
    const count = ref(0);
    return { count };
  },
  render($setup: { count: number }) {
    const n0 = t0() as Element;
    const n1 = child(n0) as Element;
    const a1 = child(n1);
    const n2 = next(n1);
    const a2 = next(n2);
    const n3 = next(a2) as Element;
    const a3 = child(n3);
    insert(
      createSlot('header', null, () => t1()),
      n1,
      a1,
    );
    on(n2, 'click', () => $setup.count++);
    insert(createSlot('default', { count: () => $setup.count }), n0, a2);
    insert(createSlot('footer'), n3, a3);
    return n0;
  },
};
