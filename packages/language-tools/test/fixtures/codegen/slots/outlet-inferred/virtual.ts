
const { title, items } = defineProps<__VibeProps>()
const extra = { level: 1 }

type __VibeProps = { title: string; items: string[] };
type __VibeEmits = {};
const __vibe_setup = { title, extra, items };
{
  const { title, extra, items } = __vibe.unrefs(__vibe_setup);
  var __vibe_s0 = ({ title: title, ...extra, 'data-x': '1' });
  __vibe.el(__vibe.tags.ul)({ });
    for (const [item, index] of __vibe.vFor(items)) {
      __vibe.el(__vibe.tags.li)({ key: item });
        var __vibe_s1 = ({ item: item, index: index });
    }
  if (items.length === 0) {
    var __vibe_s2 = ({ });
  }
  var __vibe_s3 = ({ item: title, index: -1 });
  var __vibe_s4 = ({ });
  var __vibe_s5 = ({ });
    __vibe.el(__vibe.tags.p)({ });
      (title);
}
type __VibeSlots = { header?: (props: typeof __vibe_s0) => unknown; item?: (props: typeof __vibe_s1 | typeof __vibe_s3) => unknown; empty?: (props: typeof __vibe_s2) => unknown; 'foot-note'?: (props: typeof __vibe_s4) => unknown; default?: (props: typeof __vibe_s5) => unknown };
type __VibeExposed = {};
type __VibeRefs = { r: unknown; fallback: HTMLElementTagNameMap extends Record<'p', infer E> ? E : Element };
type __VibeModels = {};
export default __vibe.defineComponent<__VibeProps, __VibeEmits, __VibeSlots, __VibeExposed, __VibeModels>();
import * as __vibe from '@usevibejs/ui/tooling';
import { defineProps } from '@usevibejs/ui/tooling';
