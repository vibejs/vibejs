
const items = [1]

type __VibeProps = {};
type __VibeEmits = {};
const __vibe_setup = { items };
{
  const { items } = __vibe.unrefs(__vibe_setup);
  const { alert, window, missing, fallback } = {};
  __vibe.el(__vibe.tags.p)({ title: String(items.length), onClick: () => { alert(window.innerWidth) } });
    (Math.max(...items));
    ({ items, missing });
  for (const [{ a = fallback }] of __vibe.vFor(items)) {
    __vibe.el(__vibe.tags.p)({ });
      (a);
  }
}
type __VibeSlots = {};
type __VibeExposed = {};
type __VibeRefs = {};
type __VibeModels = {};
export default __vibe.defineComponent<__VibeProps, __VibeEmits, __VibeSlots, __VibeExposed, __VibeModels>();
import * as __vibe from '@vibejs-org/ui/tooling';
