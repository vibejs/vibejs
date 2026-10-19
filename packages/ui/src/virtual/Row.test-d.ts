const { id, label, count = 0 } = defineProps<__VibeProps>()
const emit = defineEmits<__VibeEmits>()
type __VibeProps = { id: string; label: string; count?: number }
type __VibeEmits = { select: [id: string]; toggle: [] }
const __vibe_setup = { id, label, count, emit }
{
  const { id, label, count, emit } = __vibe.unrefs(__vibe_setup)
  const { $attrs } = __vibe.ctx<__VibeProps, __VibeEmits, __VibeSlots>()
  __vibe.el(__vibe.tags.li)({ ...$attrs, class: { active: count > 0 }, onClick: ($event) => { emit('select', id) } }); (label); (count);
  __vibe.el(__vibe.tags.button)({ type: 'button', onClick: ($event) => { emit('toggle') } });
}
type __VibeSlots = {}; type __VibeExposed = {}; type __VibeRefs = {}; type __VibeModels = {}
export const Row = __vibe.defineComponent<__VibeProps, __VibeEmits, __VibeSlots, __VibeExposed, __VibeModels>()
import * as __vibe from '@vibejs-org/ui/tooling'
import { defineProps, defineEmits, defineSlots, defineModel, defineExpose, defineOptions } from '@vibejs-org/ui/tooling'
