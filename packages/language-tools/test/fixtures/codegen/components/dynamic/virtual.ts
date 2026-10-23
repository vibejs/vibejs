
import { shallowRef } from '@usevibejs/ui'
import Comp from './Comp.vibe'
const current = shallowRef(Comp)

type __VibeProps = {};
type __VibeEmits = {};
const __vibe_setup = { current };
{
  const { current } = __vibe.unrefs(__vibe_setup);
  var __vibe_c0 = __vibe.dynamicComponent(current)({ title: 'a' });
  var __vibe_c1 = __vibe.dynamicComponent('Comp')({ });
  var __vibe_c2 = __vibe.dynamicComponent(null)({ });
}
type __VibeSlots = {};
type __VibeExposed = {};
type __VibeRefs = {};
type __VibeModels = {};
export default __vibe.defineComponent<__VibeProps, __VibeEmits, __VibeSlots, __VibeExposed, __VibeModels>();
import * as __vibe from '@usevibejs/ui/tooling';
