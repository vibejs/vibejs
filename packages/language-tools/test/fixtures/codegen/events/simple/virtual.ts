
function go() {}
const handlers = { go }

type __VibeProps = {};
type __VibeEmits = {};
const __vibe_setup = { go, handlers };
{
  const { go, handlers } = __vibe.unrefs(__vibe_setup);
  __vibe.el(__vibe.tags.button)({ onClick: go, onDblclick: handlers.go, onKeydown: () => go(), onKeyup: function () { go() } });
}
type __VibeSlots = {};
type __VibeExposed = {};
type __VibeRefs = {};
type __VibeModels = {};
export default __vibe.defineComponent<__VibeProps, __VibeEmits, __VibeSlots, __VibeExposed, __VibeModels>();
import * as __vibe from '@vibejs-org/ui/tooling';
