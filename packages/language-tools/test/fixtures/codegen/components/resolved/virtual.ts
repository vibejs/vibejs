
import Comp from './Comp.vibe'
const count = 1

type __VibeProps = {};
type __VibeEmits = {};
const __vibe_setup = { Comp, count };
{
  const { Comp, count } = __vibe.unrefs(__vibe_setup);
  var __vibe_c0 = __vibe.component(Comp)({ title: 'Static', count: count, isOpen: true, maxItems: 3, 'data-x': '1', 'aria-label': 'a', viewBox: count });
}
type __VibeSlots = {};
type __VibeExposed = {};
type __VibeRefs = {};
type __VibeModels = {};
export default __vibe.defineComponent<__VibeProps, __VibeEmits, __VibeSlots, __VibeExposed, __VibeModels>();
import * as __vibe from '@vibejs-org/ui/tooling';
