// The compiled twin of Consumer.vibe, written as the compiler emits it (types added).
import { inject, useId, type Ref } from '@vibejs-org/ui';
import {
  renderEffect,
  setAttr,
  setText,
  template,
  toDisplayString,
  txt,
  type ComponentDef,
} from '@vibejs-org/ui/internal';
import { ThemeKey } from './keys.ts';

type State = {
  theme: string;
  user: string;
  locale: string;
  id: string;
};

const t0 = template('<p> </p>');

export const Consumer: ComponentDef = {
  name: 'Consumer',
  __file: 'test/abi/Consumer.vibe',
  setup() {
    const theme: Ref<string> = inject(ThemeKey)!;
    const user = inject('user', 'guest');
    const locale = inject('locale', () => 'en', true);
    const id = useId();
    return { theme, user, locale, id };
  },
  render($setup: State) {
    const n0 = t0() as Element;
    const x0 = txt(n0);
    renderEffect(() => setAttr(n0, 'id', $setup.id));
    renderEffect(() =>
      setText(
        x0,
        toDisplayString($setup.theme) +
          ' ' +
          toDisplayString($setup.user) +
          ' ' +
          toDisplayString($setup.locale),
      ),
    );
    return n0;
  },
};
