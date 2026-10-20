
const count = 1

type __VibeProps = {};
type __VibeEmits = {};
const __vibe_setup = { count };
{
  const { count } = __vibe.unrefs(__vibe_setup);
  const __vibe_w = __vibe.writable<typeof __vibe_setup, never>(__vibe_setup);
  __vibe.el(__vibe.tags.input)({ value: count, onInput: ($event) => { __vibe_w.count = $event } });
  __vibe.el(__vibe.tags.p)({ title: count });
}
type __VibeSlots = {};
type __VibeExposed = {};
type __VibeRefs = {};
type __VibeModels = {};
export default __vibe.defineComponent<__VibeProps, __VibeEmits, __VibeSlots, __VibeExposed, __VibeModels>();
import * as __vibe from '@vibejs-org/ui/tooling';
