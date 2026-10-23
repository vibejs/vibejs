
import type { Item } from './types'
const props = defineProps<__VibeProps>()

type __VibeProps = { items: Item[]; title?: string };
type __VibeEmits = {};
const __vibe_setup = { props };
{
  const { props } = __vibe.unrefs(__vibe_setup);
  const __vibe_ctx = __vibe.ctx<__VibeProps & __VibeModels, __VibeEmits, __VibeSlots>();
  const { title, items } = __vibe_ctx;
  __vibe.el(__vibe.tags.h1)({ });
    (title);
    (props.items.length);
    (items);
}
type __VibeSlots = {};
type __VibeExposed = {};
type __VibeRefs = {};
type __VibeModels = {};
export default __vibe.defineComponent<__VibeProps, __VibeEmits, __VibeSlots, __VibeExposed, __VibeModels>();
import * as __vibe from '@usevibejs/ui/tooling';
import { defineProps } from '@usevibejs/ui/tooling';
