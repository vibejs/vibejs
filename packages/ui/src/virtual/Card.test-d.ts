import { ref } from '@vibejs-org/ui'
defineSlots<__VibeSlots>()
const { title, items } = defineProps<__VibeProps>()
const expanded = ref(false)
function toggle(): void { expanded.value = !expanded.value }
const __vibe_exposed: { toggle: () => void } = defineExpose({ toggle })
type __VibeSlots = { default?: (props: {}) => unknown; header?: (props: { title: string }) => unknown; item: (props: { item: string; index: number }) => unknown }
type __VibeProps = { title: string; items: string[] }
const __vibe_setup = { title, items, expanded, toggle }
{
  const { title, items, expanded, toggle } = __vibe.unrefs(__vibe_setup)
  __vibe.el(__vibe.tags.section)({});
  __vibe.el(__vibe.tags.header)({ onClick: toggle }); __vibe.slot<__VibeSlots, 'header'>()({ title: title });
  if (expanded) {
    __vibe.el(__vibe.tags.ul)({});
    for (const [item, index] of __vibe.vFor(items)) { __vibe.el(__vibe.tags.li)({}); __vibe.slot<__VibeSlots, 'item'>()({ item: item, index: index }); }
  }
  __vibe.slot<__VibeSlots, 'default'>()({});
}
type __VibeEmits = {}; type __VibeExposed = typeof __vibe_exposed; type __VibeRefs = {}; type __VibeModels = {}
export const Card: ReturnType<typeof __vibe.defineComponent<__VibeProps, __VibeEmits, __VibeSlots, __VibeExposed, __VibeModels>> = __vibe.defineComponent<__VibeProps, __VibeEmits, __VibeSlots, __VibeExposed, __VibeModels>()
import * as __vibe from '@vibejs-org/ui/tooling'
import { defineProps, defineEmits, defineSlots, defineModel, defineExpose, defineOptions } from '@vibejs-org/ui/tooling'
