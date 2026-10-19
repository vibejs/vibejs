
import type { Component } from '@vibejs-org/ui'
defineProps<__VibeProps>()

type __VibeProps = { Inner: Component };
type __VibeEmits = {};
const __vibe_setup = {  };
{
  const __vibe_ctx = __vibe.ctx<__VibeProps & __VibeModels, __VibeEmits, __VibeSlots>();
  const { Inner } = __vibe_ctx;
  var __vibe_c0 = __vibe.component(Inner)({ });
}
type __VibeSlots = {};
type __VibeExposed = {};
type __VibeRefs = {};
type __VibeModels = {};
export default __vibe.defineComponent<__VibeProps, __VibeEmits, __VibeSlots, __VibeExposed, __VibeModels>();
import * as __vibe from '@vibejs-org/ui/tooling';
import { defineProps } from '@vibejs-org/ui/tooling';
