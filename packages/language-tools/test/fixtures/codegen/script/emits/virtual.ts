
const emit = defineEmits<__VibeEmits>()

type __VibeProps = {};
type __VibeEmits = { pick: [id: string]; close: [] };
const __vibe_setup = { emit };
{
  const { emit } = __vibe.unrefs(__vibe_setup);
  const __vibe_ctx = __vibe.ctx<__VibeProps, __VibeEmits, __VibeSlots>();
  const { $emit } = __vibe_ctx;
  __vibe.el(__vibe.tags.button)({ onClick: ($event) => { emit('close') }, onDblclick: ($event) => { $emit('pick', 'a') } });
}
type __VibeSlots = {};
type __VibeExposed = {};
type __VibeRefs = {};
type __VibeModels = {};
export default __vibe.defineComponent<__VibeProps, __VibeEmits, __VibeSlots, __VibeExposed, __VibeModels>();
import * as __vibe from '@vibejs-org/ui/tooling';
import { defineEmits } from '@vibejs-org/ui/tooling';
