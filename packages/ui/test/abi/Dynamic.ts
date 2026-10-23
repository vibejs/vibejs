// The compiled twin of Dynamic.vibe, written as the compiler emits it (types added).
import { createDynamicComponent, type ComponentDef } from '@usevibejs/ui/internal';

type Props = {
  is: ComponentDef | null | undefined;
  label: string;
};

export const Dynamic: ComponentDef = {
  name: 'Dynamic',
  __file: 'test/abi/Dynamic.vibe',
  __propKeys: ['is', 'label'],
  render(_$setup, $props: Props) {
    return createDynamicComponent(() => $props.is, { label: () => $props.label }, null, true);
  },
};
