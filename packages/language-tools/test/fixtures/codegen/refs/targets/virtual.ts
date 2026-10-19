
import { useTemplateRef } from '@vibejs-org/ui'
import Comp from './Comp.vibe'
const input = useTemplateRef<__VibeRefs["input"]>('input')
const typed = useTemplateRef<HTMLElement>('input')
const rows = useTemplateRef<__VibeRefs["rows"]>('rows')
function setEl(el: unknown) {}

type __VibeProps = {};
type __VibeEmits = {};
const __vibe_setup = { Comp, setEl };
{
  const { Comp, setEl } = __vibe.unrefs(__vibe_setup);
  __vibe.el(__vibe.tags.input)({ });
  var __vibe_c0 = __vibe.component(Comp)({ });
  for (const [n] of __vibe.vFor(3)) {
    var __vibe_c1 = __vibe.component(Comp)({ });
  }
  __vibe.el(__vibe.tags.svg)({ });
    __vibe.el(__vibe.tags.circle)({ });
  __vibe.customElement({ });
  __vibe.el(__vibe.tags.p)({ ref: setEl });
}
type __VibeSlots = {};
type __VibeExposed = {};
type __VibeRefs = { input: HTMLElementTagNameMap extends Record<'input', infer E> ? E : Element; comp: typeof Comp extends infer __VibeC extends Parameters<typeof __vibe.component>[0] ? ReturnType<ReturnType<typeof __vibe.component<__VibeC>>>['exposed'] : unknown; rows: (typeof Comp extends infer __VibeC extends Parameters<typeof __vibe.component>[0] ? ReturnType<ReturnType<typeof __vibe.component<__VibeC>>>['exposed'] : unknown)[]; circle: SVGElementTagNameMap extends Record<'circle', infer E> ? E : Element; widget: HTMLElementTagNameMap extends Record<'x-widget', infer E> ? E : Element; slotted: unknown };
type __VibeModels = {};
export default __vibe.defineComponent<__VibeProps, __VibeEmits, __VibeSlots, __VibeExposed, __VibeModels>();
import * as __vibe from '@vibejs-org/ui/tooling';
