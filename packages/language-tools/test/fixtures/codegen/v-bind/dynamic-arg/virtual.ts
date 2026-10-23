
const name = 'title'
function go() {}

type __VibeProps = {};
type __VibeEmits = {};
const __vibe_setup = { name, go };
{
  const { name, go } = __vibe.unrefs(__vibe_setup);
  __vibe.el(__vibe.tags.p)({ [name]: name });
  (() => { go() });
  (($event: unknown) => { go($event) });
}
type __VibeSlots = {};
type __VibeExposed = {};
type __VibeRefs = {};
type __VibeModels = {};
export default __vibe.defineComponent<__VibeProps, __VibeEmits, __VibeSlots, __VibeExposed, __VibeModels>();
import * as __vibe from '@usevibejs/ui/tooling';
