// The compiled twin of ScopedRoot.vibe, written as the compiler emits it (types added).
import { createComponent, type ComponentDef } from '@vibejs-org/ui/internal';
import { ScopedChild } from './ScopedChild.ts';

export const ScopedRoot: ComponentDef = {
  name: 'ScopedRoot',
  __file: 'test/abi/ScopedRoot.vibe',
  __scopeId: 'data-vb-1a2b3c4d',
  render() {
    return createComponent(ScopedChild, null, null, true);
  },
};
