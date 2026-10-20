
const value = defineModel<string>({ required: true })
const size = defineModel<number>('value')

type __VibeProps = {};
type __VibeEmits = {};
const __vibe_setup = { value, size };
{
  const { value, size } = __vibe.unrefs(__vibe_setup);
  const __vibe_w = __vibe.writable<typeof __vibe_setup, never>(__vibe_setup);
  __vibe.el(__vibe.tags.p)({ });
    (value);
    (size);
  __vibe.el(__vibe.tags.input)({ value: value });
  __vibe_w.value = String();
}
type __VibeSlots = {};
type __VibeExposed = {};
type __VibeRefs = {};
type __VibeModels = { modelValue: (typeof value)['value']; 'onUpdate:modelValue'?: (__vibe_value: (typeof value)['value']) => void; modelModifiers?: (typeof value)[1]; value?: (typeof size)['value']; 'onUpdate:value'?: (__vibe_value: (typeof size)['value']) => void; valueModifiers?: (typeof size)[1] };
export default __vibe.defineComponent<__VibeProps, __VibeEmits, __VibeSlots, __VibeExposed, __VibeModels>();
import * as __vibe from '@vibejs-org/ui/tooling';
import { defineModel } from '@vibejs-org/ui/tooling';
