
import Comp from './Comp.vibe'
const label = 'a'

type __VibeProps = {};
type __VibeEmits = {};
const __vibe_setup = { Comp, label };
{
  const { Comp, label } = __vibe.unrefs(__vibe_setup);
  var __vibe_c0 = __vibe.component(Comp)({ title: label });
    {
      __vibe.slotParams(__vibe_c0.slots.footer);
      (label);
    }
    {
      __vibe.slotParams(__vibe_c0.slots.default);
      __vibe.el(__vibe.tags.p)({ });
        (label);
    }
}
type __VibeSlots = {};
type __VibeExposed = {};
type __VibeRefs = {};
type __VibeModels = {};
export default __vibe.defineComponent<__VibeProps, __VibeEmits, __VibeSlots, __VibeExposed, __VibeModels>();
import * as __vibe from '@vibejs-org/ui/tooling';
