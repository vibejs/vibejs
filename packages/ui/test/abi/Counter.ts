// The compiled twin of Counter.vibe, written as the compiler emits it (types added).
import { ref } from '@vibejs-org/ui';
import type { SetupContext } from '@vibejs-org/ui';
import {
  on,
  renderEffect,
  setText,
  template,
  toDisplayString,
  txt,
  withModifiers,
  type ComponentDef,
} from '@vibejs-org/ui/internal';

type Props = {
  start?: number;
  step?: number;
};

const t0 = template('<button type="button">Count: </button>');

export const Counter: ComponentDef = {
  name: 'Counter',
  __file: 'test/abi/Counter.vibe',
  __propKeys: ['start', 'step'],
  __emits: ['change'],
  __defaults: { start: () => 0, step: () => 1 },
  setup(__props: Required<Props>, __ctx: SetupContext) {
    const { emit } = __ctx;
    const count = ref(__props.start);
    function increment() {
      count.value += __props.step;
      emit('change', count.value);
    }
    __ctx.expose({ count });
    return { count, increment };
  },
  render($setup: { count: number; increment: () => void }) {
    const n0 = t0();
    const x0 = txt(n0);
    on(
      n0,
      'click',
      withModifiers(() => $setup.increment(), ['prevent']),
    );
    renderEffect(() => setText(x0, 'Count: ' + toDisplayString($setup.count)));
    return n0;
  },
};
