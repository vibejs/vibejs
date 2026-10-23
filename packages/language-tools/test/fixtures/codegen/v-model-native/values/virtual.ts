
import { ref } from '@usevibejs/ui'
const answer = ref('no')
const flag = ref<'on' | false>(false)
const n = ref(0)
const ns = ref<number[]>([])

type __VibeProps = {};
type __VibeEmits = {};
const __vibe_setup = { answer, flag, n, ns };
{
  const { answer, flag, n, ns } = __vibe.unrefs(__vibe_setup);
  const __vibe_w = __vibe.writable<typeof __vibe_setup, never>(__vibe_setup);
  __vibe.el(__vibe.tags.input)({ type: 'checkbox' });
  (answer);
  __vibe_w.answer = Boolean() ? 'yes' : 'no';
  __vibe.el(__vibe.tags.input)({ type: 'checkbox' });
  (flag);
  __vibe_w.flag = Boolean() ? 'on' as const : false;
  __vibe.el(__vibe.tags.input)({ type: 'checkbox' });
  (answer + 1);
  (answer);
  __vibe.el(__vibe.tags.input)({ type: 'radio', value: 1 });
  (n);
  __vibe_w.n = 1;
  __vibe.el(__vibe.tags.select)({ value: n });
    __vibe.el(__vibe.tags.optgroup)({ });
      __vibe.el(__vibe.tags.option)({ value: 1 });
  __vibe.el(__vibe.tags.select)({ value: n });
  __vibe_w.n = String();
    __vibe.el(__vibe.tags.option)({ });
  __vibe.el(__vibe.tags.select)({ multiple: true, value: ns });
  __vibe_w.ns = ns satisfies unknown[] | Set<unknown>;
    __vibe.el(__vibe.tags.option)({ value: 1 });
}
type __VibeSlots = {};
type __VibeExposed = {};
type __VibeRefs = {};
type __VibeModels = {};
export default __vibe.defineComponent<__VibeProps, __VibeEmits, __VibeSlots, __VibeExposed, __VibeModels>();
import * as __vibe from '@usevibejs/ui/tooling';
