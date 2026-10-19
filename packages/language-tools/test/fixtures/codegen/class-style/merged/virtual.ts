
const active = true
const color = 'red'

type __VibeProps = {};
type __VibeEmits = {};
const __vibe_setup = { active, color };
{
  const { active, color } = __vibe.unrefs(__vibe_setup);
  __vibe.el(__vibe.tags.p)({ class: ['a', { active }], style: [{ color }, 'margin: 0'], title: 't' });
  __vibe.el(__vibe.tags.p)({ class: active, style: 'color: red' });
}
type __VibeSlots = {};
type __VibeExposed = {};
type __VibeRefs = {};
type __VibeModels = {};
export default __vibe.defineComponent<__VibeProps, __VibeEmits, __VibeSlots, __VibeExposed, __VibeModels>();
import * as __vibe from '@vibejs-org/ui/tooling';
