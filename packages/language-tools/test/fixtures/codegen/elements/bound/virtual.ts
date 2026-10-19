
const id = 'x'
const size = 5

type __VibeProps = {};
type __VibeEmits = {};
const __vibe_setup = { id, size };
{
  const { id, size } = __vibe.unrefs(__vibe_setup);
  __vibe.el(__vibe.tags.input)({ id: id, maxlength: size, 'aria-label': id, name: id, title: id, key: id });
  (size);
  __vibe.el(__vibe.tags.p)({ id: 'a', class: id });
}
type __VibeSlots = {};
type __VibeExposed = {};
type __VibeRefs = {};
type __VibeModels = {};
export default __vibe.defineComponent<__VibeProps, __VibeEmits, __VibeSlots, __VibeExposed, __VibeModels>();
import * as __vibe from '@vibejs-org/ui/tooling';
