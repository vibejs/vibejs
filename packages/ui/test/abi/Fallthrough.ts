// The compiled twin of Fallthrough.vibe, written as the compiler emits it (types added).
import { createComponent, type ComponentDef } from '@vibejs-org/ui/internal';
import { Badge } from './Badge.ts';

type Props = {
  wide?: boolean;
};

export const Fallthrough: ComponentDef = {
  name: 'Fallthrough',
  __file: 'test/abi/Fallthrough.vibe',
  __propKeys: ['wide'],
  render(_$setup, $props: Props) {
    return createComponent(
      Badge,
      {
        wide: () => $props.wide,
        class: () => 'mid',
        style: () => 'color: green; font-style: italic',
      },
      null,
      true,
    );
  },
};
