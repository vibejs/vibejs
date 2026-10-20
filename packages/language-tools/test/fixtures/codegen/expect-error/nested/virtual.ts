
const count = 1

type __VibeProps = {};
type __VibeEmits = {};
const __vibe_setup = { count };
{
  const { count } = __vibe.unrefs(__vibe_setup);
  __vibe.el(__vibe.tags.div)({ });
    __vibe.el(__vibe.tags.ul)({ title: count });
      for (const [n] of __vibe.vFor(count)) {
        __vibe.el(__vibe.tags.li)({ key: n });
          (n.length);
      }
}
type __VibeSlots = {};
type __VibeExposed = {};
type __VibeRefs = {};
type __VibeModels = {};
export default __vibe.defineComponent<__VibeProps, __VibeEmits, __VibeSlots, __VibeExposed, __VibeModels>();
import * as __vibe from '@vibejs-org/ui/tooling';
