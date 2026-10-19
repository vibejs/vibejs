
import { ref } from '@vibejs-org/ui'
const count = ref(0)

type __VibeProps = {};
type __VibeEmits = {};
const __vibe_setup = { count };
{
  const { count } = __vibe.unrefs(__vibe_setup);
  const { go } = {};
  const __vibe_w = __vibe.writable<typeof __vibe_setup, never>(__vibe_setup);
  __vibe.el(__vibe.tags.button)({ onClick: () => { __vibe_w.count++; __vibe_w.count-- }, onDblclick: () => { go() }, onMyEvent: () => { __vibe_w.count = 1 }, 'onUpdate:open': () => { __vibe_w.count = 2 } });
}
type __VibeSlots = {};
type __VibeExposed = {};
type __VibeRefs = {};
type __VibeModels = {};
export default __vibe.defineComponent<__VibeProps, __VibeEmits, __VibeSlots, __VibeExposed, __VibeModels>();
import * as __vibe from '@vibejs-org/ui/tooling';
