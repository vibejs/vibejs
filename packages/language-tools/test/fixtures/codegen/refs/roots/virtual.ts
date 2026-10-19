
import { useTemplateRef, type Component } from '@vibejs-org/ui'
import Row from './Row.vibe'
defineProps<__VibeProps>()
const Local = Row
const local = useTemplateRef<__VibeRefs["local"]>('local')
const quoted = useTemplateRef<__VibeRefs["a'b"]>("a'b")

type __VibeProps = { Item: Component };
type __VibeEmits = {};
const __vibe_setup = { Local, local, Row, quoted };
{
  const { Local, local, Row, quoted } = __vibe.unrefs(__vibe_setup);
  const __vibe_ctx = __vibe.ctx<__VibeProps & __VibeModels, __VibeEmits, __VibeSlots>();
  const { Item } = __vibe_ctx;
  var __vibe_c0 = __vibe.component(Local)({ });
  __vibe.el(__vibe.tags.p)({ });
    (local ? 'y' : 'n');
  var __vibe_c1 = __vibe.component(Item)({ });
  for (const [C] of __vibe.vFor([Row])) {
    var __vibe_c2 = __vibe.component(C)({ });
  }
  __vibe.el(__vibe.tags.p)({ });
    (quoted);
}
type __VibeSlots = {};
type __VibeExposed = {};
type __VibeRefs = { local: ReturnType<typeof __vibe.unrefs<{ c: typeof Local }>>['c'] extends infer __VibeC extends Parameters<typeof __vibe.component>[0] ? ReturnType<ReturnType<typeof __vibe.component<__VibeC>>>['exposed'] : unknown; item: ReturnType<typeof __vibe.ctx<__VibeProps & __VibeModels, __VibeEmits, __VibeSlots>>['Item'] extends infer __VibeC extends Parameters<typeof __vibe.component>[0] ? ReturnType<ReturnType<typeof __vibe.component<__VibeC>>>['exposed'] : unknown; looped: (typeof __vibe_c2.exposed)[]; 'a\u0027b': HTMLElementTagNameMap extends Record<'p', infer E> ? E : Element };
type __VibeModels = {};
export default __vibe.defineComponent<__VibeProps, __VibeEmits, __VibeSlots, __VibeExposed, __VibeModels>();
import * as __vibe from '@vibejs-org/ui/tooling';
import { defineProps } from '@vibejs-org/ui/tooling';
