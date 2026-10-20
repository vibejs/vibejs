
import Child from './Child.vibe'

type __VibeProps = {};
type __VibeEmits = {};
const __vibe_setup = { Child };
{
  const { Child } = __vibe.unrefs(__vibe_setup);
  var __vibe_c0 = __vibe.component(Child)({ count: 'x' });
    {
      const [{ row }] = __vibe.slotParams(__vibe_c0.slots.item);
      (row.missing);
    }
}
type __VibeSlots = {};
type __VibeExposed = {};
type __VibeRefs = {};
type __VibeModels = {};
export default __vibe.defineComponent<__VibeProps, __VibeEmits, __VibeSlots, __VibeExposed, __VibeModels>();
import * as __vibe from '@vibejs-org/ui/tooling';
