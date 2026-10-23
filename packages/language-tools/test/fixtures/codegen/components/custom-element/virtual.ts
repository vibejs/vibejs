
const tone = 'info'

type __VibeProps = {};
type __VibeEmits = {};
const __vibe_setup = { tone };
{
  const { tone } = __vibe.unrefs(__vibe_setup);
  __vibe.customElement({ tone: tone, flag: true, onDismiss: ($event) => { $event.preventDefault() } });
    (tone);
}
type __VibeSlots = {};
type __VibeExposed = {};
type __VibeRefs = {};
type __VibeModels = {};
export default __vibe.defineComponent<__VibeProps, __VibeEmits, __VibeSlots, __VibeExposed, __VibeModels>();
import * as __vibe from '@usevibejs/ui/tooling';
