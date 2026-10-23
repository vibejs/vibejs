
const scores = { ada: 1 }
const items = [1]

type __VibeProps = {};
type __VibeEmits = {};
const __vibe_setup = { scores, items };
{
  const { scores, items } = __vibe.unrefs(__vibe_setup);
  for (const [score, name, index] of __vibe.vFor(scores)) {
    __vibe.el(__vibe.tags.li)({ });
      (name);
      (score);
      (index);
  }
  for (const [, key] of __vibe.vFor(scores)) {
    __vibe.el(__vibe.tags.li)({ });
      (key);
  }
  if (items) {
    for (const [items, i] of __vibe.vFor(items)) {
      __vibe.el(__vibe.tags.li)({ });
        (items);
        (i);
    }
  }
}
type __VibeSlots = {};
type __VibeExposed = {};
type __VibeRefs = {};
type __VibeModels = {};
export default __vibe.defineComponent<__VibeProps, __VibeEmits, __VibeSlots, __VibeExposed, __VibeModels>();
import * as __vibe from '@usevibejs/ui/tooling';
