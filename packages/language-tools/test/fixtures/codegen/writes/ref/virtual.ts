
import { ref } from '@vibejs-org/ui'
const count = ref(0)
const total = 1
defineProps<__VibeProps>()

type __VibeProps = { limit: number };
type __VibeEmits = {};
const __vibe_setup = { count, total };
{
  const { count, total } = __vibe.unrefs(__vibe_setup);
  const __vibe_ctx = __vibe.ctx<__VibeProps & __VibeModels, __VibeEmits, __VibeSlots>();
  const { limit, $props } = __vibe_ctx;
  const __vibe_unknown = {};
  const __vibe_w = __vibe.writable<typeof __vibe_setup, never>(__vibe_setup);
  __vibe.el(__vibe.tags.button)({ onClick: () => { __vibe_w.count += 1; __vibe_w.total = 2; __vibe_ctx.limit++; __vibe_ctx.$props = {}; __vibe_unknown.missing = 1 } });
    (count);
}
type __VibeSlots = {};
type __VibeExposed = {};
type __VibeRefs = {};
type __VibeModels = {};
export default __vibe.defineComponent<__VibeProps, __VibeEmits, __VibeSlots, __VibeExposed, __VibeModels>();
import * as __vibe from '@vibejs-org/ui/tooling';
import { defineProps } from '@vibejs-org/ui/tooling';
