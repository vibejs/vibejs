
const model = defineModel<string>({ required: true })
const [title, titleModifiers] = defineModel<string, 'trim'>('title')
const count = defineModel<number>('first-count', { default: () => 0 })

type __VibeProps = {};
type __VibeEmits = {};
const __vibe_setup = { model, title, titleModifiers, count };
{
  const { model, title, titleModifiers, count } = __vibe.unrefs(__vibe_setup);
  const __vibe_ctx = __vibe.ctx<__VibeProps & __VibeModels, __VibeEmits, __VibeSlots>();
  const { modelValue } = __vibe_ctx;
  __vibe.el(__vibe.tags.p)({ });
    (model);
    (title);
    (titleModifiers.trim);
    (count);
    (modelValue);
}
type __VibeSlots = {};
type __VibeExposed = {};
type __VibeRefs = {};
type __VibeModels = { modelValue: (typeof model)['value']; 'onUpdate:modelValue'?: (__vibe_value: (typeof model)['value']) => void; modelModifiers?: (typeof model)[1]; title?: (typeof title)['value']; 'onUpdate:title'?: (__vibe_value: (typeof title)['value']) => void; titleModifiers?: (typeof title)[1]; 'first-count'?: (typeof count)['value']; 'onUpdate:first-count'?: (__vibe_value: (typeof count)['value']) => void; 'first-countModifiers'?: (typeof count)[1] };
export default __vibe.defineComponent<__VibeProps, __VibeEmits, __VibeSlots, __VibeExposed, __VibeModels>();
import * as __vibe from '@usevibejs/ui/tooling';
import { defineModel } from '@usevibejs/ui/tooling';
