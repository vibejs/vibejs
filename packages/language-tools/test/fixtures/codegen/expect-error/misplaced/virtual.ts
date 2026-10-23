
// @vibe-expect-error is not a directive in the script.
const label = 'a'

type __VibeProps = {};
type __VibeEmits = {};
const __vibe_setup = { label };
{
  const { label } = __vibe.unrefs(__vibe_setup);
  __vibe.el(__vibe.tags.p)({ });
  __vibe.el(__vibe.tags.p)({ });
    (label);
}
type __VibeSlots = {};
type __VibeExposed = {};
type __VibeRefs = {};
type __VibeModels = {};
export default __vibe.defineComponent<__VibeProps, __VibeEmits, __VibeSlots, __VibeExposed, __VibeModels>();
import * as __vibe from '@usevibejs/ui/tooling';
