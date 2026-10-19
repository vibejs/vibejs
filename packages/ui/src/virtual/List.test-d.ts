import { ref, shallowRef } from '@vibejs-org/ui'
import { Row } from './Row.test-d.ts'
type Item = { id: string; label: string; count?: number }
const { items, title = 'List' } = defineProps<__VibeProps>()
const emit = defineEmits<__VibeEmits>()
const user = ref<{ name: string } | null>(null)
const open = ref(false)
const current = shallowRef(Row)
let clicks = 0
function greet(name: string) { emit('pick', name) }
type __VibeProps = { items: Item[]; title?: string }
type __VibeEmits = { pick: [id: string] }
const __vibe_setup = { Row, items, title, emit, user, open, current, clicks, greet }
{
  const { Row, items, title, emit, user, open, current, clicks, greet } = __vibe.unrefs(__vibe_setup)
  const __vibe_w = __vibe.writable<typeof __vibe_setup, 'clicks'>(__vibe_setup)
  if (open) { __vibe.el(__vibe.tags.h1)({}); (title); }
  for (const [item] of __vibe.vFor(items)) {
    var __vibe_c0 = __vibe.component(Row)({ key: item.id, id: item.id, label: item.label, count: item.count, onSelect: ($event) => { emit('pick', $event) } });
  }
  if (user) { __vibe.el(__vibe.tags.button)({ onClick: ($event) => { greet(user.name) } }); }
  __vibe.el(__vibe.tags.button)({ onClick: ($event) => { __vibe_w.open = !open; __vibe_w.clicks++ } }); (clicks);
  __vibe.customElement({ tone: 'info', onDismiss: ($event) => { emit('pick', $event.type) } });
  var __vibe_c1 = __vibe.dynamicComponent(current)({ title: title });
}
type __VibeSlots = {}; type __VibeExposed = {}; type __VibeRefs = {}; type __VibeModels = {}
export const List = __vibe.defineComponent<__VibeProps, __VibeEmits, __VibeSlots, __VibeExposed, __VibeModels>()
import * as __vibe from '@vibejs-org/ui/tooling'
import { defineProps, defineEmits, defineSlots, defineModel, defineExpose, defineOptions } from '@vibejs-org/ui/tooling'
