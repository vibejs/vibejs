
function set(value: string) {
  return value
}

type __VibeProps = {};
type __VibeEmits = {};
const __vibe_setup = { set };
{
  const { set } = __vibe.unrefs(__vibe_setup);
  __vibe.el(__vibe.tags.input)({ onInput: ($event) => { set(($event.target as HTMLInputElement).value) }, onClick: ($event) => { $event.preventDefault() } });
  ({ onClick: () => { set('dup') } } satisfies Partial<typeof __vibe.tags.input>);
}
type __VibeSlots = {};
type __VibeExposed = {};
type __VibeRefs = {};
type __VibeModels = {};
export default __vibe.defineComponent<__VibeProps, __VibeEmits, __VibeSlots, __VibeExposed, __VibeModels>();
import * as __vibe from '@vibejs-org/ui/tooling';
