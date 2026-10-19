
import { ref } from '@vibejs-org/ui'
const text = ref('')
const amount = ref(0)
const done = ref(false)
const tags = ref<string[]>([])

type __VibeProps = {};
type __VibeEmits = {};
const __vibe_setup = { text, amount, tags, done };
{
  const { text, amount, tags, done } = __vibe.unrefs(__vibe_setup);
  const __vibe_w = __vibe.writable<typeof __vibe_setup, never>(__vibe_setup);
  __vibe.el(__vibe.tags.input)({ value: text });
  __vibe_w.text = String();
  __vibe.el(__vibe.tags.input)({ value: amount });
  __vibe_w.amount = Number();
  __vibe.el(__vibe.tags.input)({ type: 'number', value: amount });
  __vibe_w.amount = Number();
  __vibe.el(__vibe.tags.input)({ value: text });
  __vibe_w.text = String();
  __vibe.el(__vibe.tags.textarea)({ value: text });
  __vibe_w.text = String();
  __vibe.el(__vibe.tags.select)({ value: text });
  __vibe_w.text = String();
  __vibe.el(__vibe.tags.select)({ multiple: true, value: tags });
  __vibe_w.tags = tags satisfies unknown[] | Set<unknown>;
  __vibe.el(__vibe.tags.input)({ type: 'radio', value: 'a' });
  (text);
  __vibe_w.text = String();
  __vibe.el(__vibe.tags.input)({ type: 'checkbox', checked: done });
  __vibe_w.done = done satisfies boolean | unknown[] | Set<unknown>;
  __vibe.customElement({ value: text });
  __vibe_w.text = String();
}
type __VibeSlots = {};
type __VibeExposed = {};
type __VibeRefs = {};
type __VibeModels = {};
export default __vibe.defineComponent<__VibeProps, __VibeEmits, __VibeSlots, __VibeExposed, __VibeModels>();
import * as __vibe from '@vibejs-org/ui/tooling';
