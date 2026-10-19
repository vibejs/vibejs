// A counter as a prod build compiles it (no `name`, `__file` or `__hmrId`), mounted on `#app`.
import { createApp, ref } from '@vibejs-org/ui';
import {
  on,
  renderEffect,
  setText,
  template,
  toDisplayString,
  txt,
  type ComponentDef,
} from '@vibejs-org/ui/internal';

const t0 = template('<button type="button"> </button>');

const Counter: ComponentDef = {
  setup() {
    const count = ref(0);
    return { count };
  },
  render($setup: { count: number }) {
    const n0 = t0();
    const x0 = txt(n0);
    on(n0, 'click', () => $setup.count++);
    renderEffect(() => setText(x0, toDisplayString($setup.count)));
    return n0;
  },
};

createApp(Counter).mount('#app');
