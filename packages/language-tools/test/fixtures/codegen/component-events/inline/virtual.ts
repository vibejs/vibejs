
import { ref } from '@usevibejs/ui'
import Comp from './Comp.vibe'
const count = ref(0)

type __VibeProps = {};
type __VibeEmits = {};
const __vibe_setup = { Comp, count };
{
  const { Comp, count } = __vibe.unrefs(__vibe_setup);
  const __vibe_w = __vibe.writable<typeof __vibe_setup, never>(__vibe_setup);
  var __vibe_c0 = __vibe.component(Comp)({ onToggle: () => { __vibe_w.count++ }, onSelect: ($event) => { __vibe_w.count = $event.length } });
}
type __VibeSlots = {};
type __VibeExposed = {};
type __VibeRefs = {};
type __VibeModels = {};
export default __vibe.defineComponent<__VibeProps, __VibeEmits, __VibeSlots, __VibeExposed, __VibeModels>();
import * as __vibe from '@usevibejs/ui/tooling';
