
import { ref } from '@vibejs-org/ui'
import Comp from './Comp.vibe'
const text = ref('')
const open = ref(false)

type __VibeProps = {};
type __VibeEmits = {};
const __vibe_setup = { Comp, text, open };
{
  const { Comp, text, open } = __vibe.unrefs(__vibe_setup);
  const __vibe_w = __vibe.writable<typeof __vibe_setup, never>(__vibe_setup);
  var __vibe_c0 = __vibe.component(Comp)({ modelValue: text, 'onUpdate:modelValue': ($event = undefined as never) => { __vibe_w.text = $event } });
  var __vibe_c1 = __vibe.component(Comp)({ open: open, 'onUpdate:open': ($event = undefined as never) => { __vibe_w.open = $event } });
  var __vibe_c2 = __vibe.component(Comp)({ modelValue: text, 'onUpdate:modelValue': ($event = undefined as never) => { __vibe_w.text = $event }, modelModifiers: { trim: true }, title: text, 'onUpdate:title': ($event = undefined as never) => { __vibe_w.text = $event }, titleModifiers: { trim: true, lazy: true } });
  var __vibe_c3 = __vibe.component(Comp)({ modelValue: text + 1 });
  var __vibe_c4 = __vibe.dynamicComponent(Comp)({ modelValue: text });
}
type __VibeSlots = {};
type __VibeExposed = {};
type __VibeRefs = {};
type __VibeModels = {};
export default __vibe.defineComponent<__VibeProps, __VibeEmits, __VibeSlots, __VibeExposed, __VibeModels>();
import * as __vibe from '@vibejs-org/ui/tooling';
