
let label = 'a'
let other = 'b'

type __VibeProps = {};
type __VibeEmits = {};
const __vibe_setup = { label, other };
{
  const { label, other } = __vibe.unrefs(__vibe_setup);
  const __vibe_w = __vibe.writable<typeof __vibe_setup, 'label' | 'other'>(__vibe_setup);
  __vibe.el(__vibe.tags.button)({ onClick: () => { __vibe_w.label = 'b' } });
    (label);
    (other);
}
type __VibeSlots = {};
type __VibeExposed = {};
type __VibeRefs = {};
type __VibeModels = {};
export default __vibe.defineComponent<__VibeProps, __VibeEmits, __VibeSlots, __VibeExposed, __VibeModels>();
import * as __vibe from '@vibejs-org/ui/tooling';
