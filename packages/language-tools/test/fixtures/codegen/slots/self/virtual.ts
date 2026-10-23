
type Node = { label: string; children: Node[] }
const { node } = defineProps<__VibeProps>()

type __VibeProps = { node: Node };
type __VibeEmits = {};
const __vibe_setup = { node };
{
  const { node } = __vibe.unrefs(__vibe_setup);
  var __vibe_s0 = ({ node: node });
    (node.label);
  for (const [child] of __vibe.vFor(node.children)) {
    var __vibe_c0 = __vibe.component(__vibe_self)({ key: child.label, node: child });
      {
        const [{ node: n }] = __vibe.slotParams(__vibe_c0.slots.item);
        var __vibe_s1 = ({ node: n });
      }
      {
        __vibe.slotParams(__vibe_c0.slots.only);
        var __vibe_s2 = ({ });
      }
  }
}
type __VibeSlots = { item?: (props: typeof __vibe_s0) => unknown; only?: (props: any) => unknown };
type __VibeExposed = {};
type __VibeRefs = {};
type __VibeModels = {};
export default __vibe.defineComponent<__VibeProps, __VibeEmits, __VibeSlots, __VibeExposed, __VibeModels>();
import * as __vibe from '@usevibejs/ui/tooling';
import __vibe_self from "./Tree.vibe";
import { defineProps } from '@usevibejs/ui/tooling';
