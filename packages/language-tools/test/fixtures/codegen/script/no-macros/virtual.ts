
import { ref } from '@vibejs-org/ui'
const count = ref(0)
// defineProps is not called

type __VibeProps = {};
type __VibeEmits = {};
const __vibe_setup = { count };
{
  const { count } = __vibe.unrefs(__vibe_setup);
  __vibe.el(__vibe.tags.p)({ });
    (count);
}
type __VibeSlots = {};
type __VibeExposed = {};
type __VibeRefs = {};
type __VibeModels = {};
export default __vibe.defineComponent<__VibeProps, __VibeEmits, __VibeSlots, __VibeExposed, __VibeModels>();
import * as __vibe from '@vibejs-org/ui/tooling';
import { defineProps } from '@vibejs-org/ui/tooling';
