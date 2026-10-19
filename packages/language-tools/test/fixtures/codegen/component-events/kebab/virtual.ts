
import Comp from './Comp.vibe'
function go() {}

type __VibeProps = {};
type __VibeEmits = {};
const __vibe_setup = { Comp, go };
{
  const { Comp, go } = __vibe.unrefs(__vibe_setup);
  var __vibe_c0 = __vibe.component(Comp)({ onItemPicked: () => { go() }, 'onUpdate:open': go });
}
type __VibeSlots = {};
type __VibeExposed = {};
type __VibeRefs = {};
type __VibeModels = {};
export default __vibe.defineComponent<__VibeProps, __VibeEmits, __VibeSlots, __VibeExposed, __VibeModels>();
import * as __vibe from '@vibejs-org/ui/tooling';
