
type Node = { label: string; children: Node[] }
const { node } = defineProps<__VibeProps>()

type __VibeProps = { node: Node };
type __VibeEmits = {};
const __vibe_setup = { node };
{
  const { node } = __vibe.unrefs(__vibe_setup);
  __vibe.el(__vibe.tags.p)({ });
    (node.label);
  for (const [child] of __vibe.vFor(node.children)) {
    var __vibe_c0 = __vibe.component(__vibe_self)({ key: child.label, node: child });
  }
}
type __VibeSlots = {};
type __VibeExposed = {};
type __VibeRefs = {};
type __VibeModels = {};
export default __vibe.defineComponent<__VibeProps, __VibeEmits, __VibeSlots, __VibeExposed, __VibeModels>();
import * as __vibe from '@vibejs-org/ui/tooling';
import __vibe_self from "./Tree.vibe";
import { defineProps } from '@vibejs-org/ui/tooling';
