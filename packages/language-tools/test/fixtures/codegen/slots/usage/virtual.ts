
import List from './List.vibe'
const rows = [{ id: 1 }]
const ok = true
const current = List

type __VibeProps = {};
type __VibeEmits = {};
const __vibe_setup = { List, rows, ok, current };
{
  const { List, rows, ok, current } = __vibe.unrefs(__vibe_setup);
  var __vibe_c0 = __vibe.component(List)({ rows: rows });
    if (ok) {
      {
        __vibe.slotParams(__vibe_c0.slots.header);
      }
    }
    else {
      {
        __vibe.slotParams(__vibe_c0.slots.empty);
      }
    }
    {
      const [{ item, index = 0 }] = __vibe.slotParams(__vibe_c0.slots.item);
      __vibe.el(__vibe.tags.p)({ });
        (item.id + index);
    }
    {
      __vibe.slotParams(__vibe_c0.slots['foot-note']);
    }
    {
      const [all] = __vibe.slotParams(__vibe_c0.slots.default);
      (all);
    }
  var __vibe_c1 = __vibe.component(List)({ rows: rows });
    {
      const [{ item }] = __vibe.slotParams(__vibe_c1.slots.default);
      (item);
    }
  var __vibe_c2 = __vibe.component(List)({ rows: rows });
    {
      __vibe.slotParams(__vibe_c2.slots.default);
      (ok);
    }
  var __vibe_c3 = __vibe.component(List)({ rows: rows });
    {
      __vibe.slotParams(__vibe_c3.slots.header);
    }
  var __vibe_c4 = __vibe.dynamicComponent(current)({ });
    {
      const [{ item }] = __vibe.slotParams(__vibe_c4.slots.item);
      (item);
    }
  __vibe.customElement({ });
    __vibe.el(__vibe.tags.p)({ });
      (ok);
}
type __VibeSlots = {};
type __VibeExposed = {};
type __VibeRefs = { row: HTMLElementTagNameMap extends Record<'p', infer E> ? E : Element };
type __VibeModels = {};
export default __vibe.defineComponent<__VibeProps, __VibeEmits, __VibeSlots, __VibeExposed, __VibeModels>();
import * as __vibe from '@vibejs-org/ui/tooling';
