
const { title } = defineProps<__VibeProps>()
defineSlots<__VibeSlots>()

type __VibeProps = { title: string };
type __VibeEmits = {};
type __VibeSlots = { default?: (props: {}) => unknown; header: (props: { title: string }) => unknown };
const __vibe_setup = { title };
{
  const { title } = __vibe.unrefs(__vibe_setup);
  __vibe.slot<__VibeSlots, 'header'>()({ title: title });
  __vibe.slot<__VibeSlots, 'default'>()({ });
}
type __VibeExposed = {};
type __VibeRefs = {};
type __VibeModels = {};
export default __vibe.defineComponent<__VibeProps, __VibeEmits, __VibeSlots, __VibeExposed, __VibeModels>();
import * as __vibe from '@usevibejs/ui/tooling';
import { defineProps, defineSlots } from '@usevibejs/ui/tooling';
