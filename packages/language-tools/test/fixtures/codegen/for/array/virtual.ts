
const items = [{ id: 1, name: 'a' }]

type __VibeProps = {};
type __VibeEmits = {};
const __vibe_setup = { items };
{
  const { items } = __vibe.unrefs(__vibe_setup);
  for (const [item, i] of __vibe.vFor(items)) {
    __vibe.el(__vibe.tags.li)({ key: item.id });
      (i);
      (item.name);
  }
  for (const [{ id, name = 'x' }] of __vibe.vFor(items)) {
    __vibe.el(__vibe.tags.li)({ });
      (id);
      (name);
  }
}
type __VibeSlots = {};
type __VibeExposed = {};
type __VibeRefs = {};
type __VibeModels = {};
export default __vibe.defineComponent<__VibeProps, __VibeEmits, __VibeSlots, __VibeExposed, __VibeModels>();
import * as __vibe from '@vibejs-org/ui/tooling';
