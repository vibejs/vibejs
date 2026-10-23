// The compiled twin of Badge.vibe, written as the compiler emits it (types added).
import { createIf, template, type ComponentDef } from '@usevibejs/ui/internal';

type Props = {
  wide?: boolean;
};

const t0 = template('<strong class="badge" style="color: red">Wide</strong>');
const t1 = template('<span class="badge" style="color: red">Badge</span>');

export const Badge: ComponentDef = {
  name: 'Badge',
  __file: 'test/abi/Badge.vibe',
  __propKeys: ['wide'],
  render(_$setup, $props: Props) {
    return createIf(
      () => $props.wide,
      () => t0(),
      () => t1(),
    );
  },
};
