// The compiled twin of Provide.vibe, written as the compiler emits it (types added).
import { provide, ref } from '@usevibejs/ui';
import {
  child,
  createComponent,
  insert,
  next,
  on,
  template,
  type ComponentDef,
} from '@usevibejs/ui/internal';
import { Consumer } from './Consumer.ts';
import { ThemeKey } from './keys.ts';

const t0 = template('<section><button type="button">Toggle</button><!----><!----></section>');

export const Provide: ComponentDef = {
  name: 'Provide',
  __file: 'test/abi/Provide.vibe',
  setup() {
    const theme = ref('dark');
    provide(ThemeKey, theme);
    return { theme };
  },
  render($setup: { theme: string }) {
    const n0 = t0() as Element;
    const n1 = child(n0);
    const a0 = next(n1);
    const a1 = next(a0);
    on(n1, 'click', () => ($setup.theme = $setup.theme === 'dark' ? 'light' : 'dark'));
    insert(createComponent(Consumer), n0, a0);
    insert(createComponent(Consumer), n0, a1);
    return n0;
  },
};
