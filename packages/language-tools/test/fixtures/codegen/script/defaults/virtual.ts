
const { items, title = 'List' } = defineProps<__VibeProps>()
const emit = defineEmits<__VibeEmits>()

type __VibeProps = { items: string[]; title?: string };
type __VibeEmits = { pick: [id: string] };
const __vibe_setup = { emit, title, items };
{
  const { emit, title, items } = __vibe.unrefs(__vibe_setup);
  __vibe.el(__vibe.tags.h1)({ onClick: () => { emit('pick', title) } });
    (title);
    (items.length);
}
type __VibeSlots = {};
type __VibeExposed = {};
type __VibeRefs = {};
type __VibeModels = {};
export default __vibe.defineComponent<__VibeProps, __VibeEmits, __VibeSlots, __VibeExposed, __VibeModels>();
import * as __vibe from '@vibejs-org/ui/tooling';
import { defineProps, defineEmits } from '@vibejs-org/ui/tooling';
