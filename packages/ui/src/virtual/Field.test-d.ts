import { ref } from '@vibejs-org/ui'
defineProps<__VibeProps>()
const model = defineModel<string>({ required: true })
const count = defineModel<number>('count', { default: () => 0 })
const title = defineModel<string, 'trim'>('title')
const [, titleModifiers] = title
const done = ref(false)
const picked = ref<string[]>([])
type __VibeProps = { label: string }
const __vibe_setup = { model, count, title, titleModifiers, done, picked }
{
  const { model, count, title, titleModifiers, done, picked } = __vibe.unrefs(__vibe_setup)
  const { label } = __vibe.ctx<__VibeProps, __VibeEmits, __VibeSlots>()
  const __vibe_w = __vibe.writable<typeof __vibe_setup, never>(__vibe_setup)
  __vibe.el(__vibe.tags.label)({}); (label);
  __vibe.el(__vibe.tags.input)({ value: model }); __vibe_w.model = String();
  __vibe.el(__vibe.tags.input)({ type: 'number', value: count }); __vibe_w.count = Number();
  __vibe.el(__vibe.tags.input)({ placeholder: titleModifiers.trim ? 'trimmed' : 'raw', value: title }); __vibe_w.title = String();
  __vibe.el(__vibe.tags.input)({ type: 'checkbox', checked: done }); __vibe_w.done = done satisfies boolean | unknown[] | Set<unknown>;
  __vibe.el(__vibe.tags.input)({ type: 'checkbox', value: 'a', checked: picked }); __vibe_w.picked = picked satisfies boolean | unknown[] | Set<unknown>;
}
type __VibeEmits = {}; type __VibeSlots = {}; type __VibeExposed = {}; type __VibeRefs = {}
type __VibeModels = {
  modelValue: (typeof model)['value']; 'onUpdate:modelValue'?: (value: (typeof model)['value']) => void; modelModifiers?: (typeof model)[1]
  count?: (typeof count)['value']; 'onUpdate:count'?: (value: (typeof count)['value']) => void; countModifiers?: (typeof count)[1]
  title?: (typeof title)['value']; 'onUpdate:title'?: (value: (typeof title)['value']) => void; titleModifiers?: (typeof title)[1]
}
export const Field = __vibe.defineComponent<__VibeProps, __VibeEmits, __VibeSlots, __VibeExposed, __VibeModels>()
import * as __vibe from '@vibejs-org/ui/tooling'
import { defineProps, defineEmits, defineSlots, defineModel, defineExpose, defineOptions } from '@vibejs-org/ui/tooling'
