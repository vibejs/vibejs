// The compiled twin of ScopedRoot.vibe, written as the compiler emits it (types added).
import { createComponent, type ComponentDef } from '@vibejs-org/ui/internal';
import { ScopedChild } from './ScopedChild.ts';

type Props = {
  open?: boolean;
};

export const ScopedRoot: ComponentDef = {
  name: 'ScopedRoot',
  __file: 'test/abi/ScopedRoot.vibe',
  __scopeId: 'data-vb-1a2b3c4d',
  __propKeys: ['open'],
  render(_$setup, $props: Props) {
    return createComponent(ScopedChild, { open: () => $props.open }, null, true);
  },
};
