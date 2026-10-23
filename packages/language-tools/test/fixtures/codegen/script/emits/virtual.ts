
const emit = defineEmits<__VibeEmits>()

type __VibeProps = {};
type __VibeEmits = { pick: [id: string]; close: [] };
const __vibe_setup = { emit };
{
  const { emit } = __vibe.unrefs(__vibe_setup);
  const __vibe_ctx = __vibe.ctx<__VibeProps & __VibeModels, __VibeEmits, __VibeSlots>();
  const { $emit } = __vibe_ctx;
  __vibe.el(__vibe.tags.button)({ onClick: () => { emit('close') }, onDblclick: () => { $emit('pick', 'a') } });
}
type __VibeSlots = {};
type __VibeExposed = {};
type __VibeRefs = {};
type __VibeModels = {};
export default __vibe.defineComponent<__VibeProps, __VibeEmits, __VibeSlots, __VibeExposed, __VibeModels>();
import * as __vibe from '@usevibejs/ui/tooling';
import { defineEmits } from '@usevibejs/ui/tooling';
