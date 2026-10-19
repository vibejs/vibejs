import { Card } from './Card.test-d.ts'
const fruits = ['apple', 'pear']
const __vibe_setup = { Card, fruits }
{
  const { Card, fruits } = __vibe.unrefs(__vibe_setup)
  var __vibe_c0 = __vibe.component(Card)({ title: 'Fruits', items: fruits });
  { const [{ title }] = __vibe.slotParams(__vibe_c0.slots.header); __vibe.el(__vibe.tags.h2)({}); (title.toUpperCase()); }
  { const [{ item, index }] = __vibe.slotParams(__vibe_c0.slots.item); __vibe.el(__vibe.tags.span)({}); (index + 1); (item); }
  { __vibe.slotParams(__vibe_c0.slots.default); __vibe.el(__vibe.tags.p)({}); }
}
type __VibeProps = {}; type __VibeEmits = {}; type __VibeSlots = {}; type __VibeExposed = {}; type __VibeRefs = {}; type __VibeModels = {}
export const CardParent: ReturnType<typeof __vibe.defineComponent<__VibeProps, __VibeEmits, __VibeSlots, __VibeExposed, __VibeModels>> = __vibe.defineComponent<__VibeProps, __VibeEmits, __VibeSlots, __VibeExposed, __VibeModels>()
import * as __vibe from '@vibejs-org/ui/tooling'
import { defineProps, defineEmits, defineSlots, defineModel, defineExpose, defineOptions } from '@vibejs-org/ui/tooling'
