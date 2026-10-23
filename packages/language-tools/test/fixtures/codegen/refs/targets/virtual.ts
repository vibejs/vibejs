
import { useTemplateRef } from '@usevibejs/ui'
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
  var __vibe_s0 = ({ });
    __vibe.el(__vibe.tags.p)({ });
  __vibe.el(__vibe.tags.p)({ ref: setEl });
}
type __VibeSlots = { default?: (props: typeof __vibe_s0) => unknown };
type __VibeExposed = {};
type __VibeRefs = { input: HTMLElementTagNameMap extends Record<'input', infer E> ? E : Element; comp: ReturnType<typeof __vibe.unrefs<{ c: typeof Comp }>>['c'] extends infer __VibeC extends Parameters<typeof __vibe.component>[0] ? ReturnType<ReturnType<typeof __vibe.component<__VibeC>>>['exposed'] : unknown; rows: (ReturnType<typeof __vibe.unrefs<{ c: typeof Comp }>>['c'] extends infer __VibeC extends Parameters<typeof __vibe.component>[0] ? ReturnType<ReturnType<typeof __vibe.component<__VibeC>>>['exposed'] : unknown)[]; circle: SVGElementTagNameMap extends Record<'circle', infer E> ? E : Element; widget: HTMLElementTagNameMap extends Record<'x-widget', infer E> ? E : Element; slotted: HTMLElementTagNameMap extends Record<'p', infer E> ? E : Element };
type __VibeModels = {};
export default __vibe.defineComponent<__VibeProps, __VibeEmits, __VibeSlots, __VibeExposed, __VibeModels>();
import * as __vibe from '@usevibejs/ui/tooling';
