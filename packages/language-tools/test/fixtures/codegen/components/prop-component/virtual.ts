
import type { Component } from '@usevibejs/ui'
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
import * as __vibe from '@usevibejs/ui/tooling';
import { defineProps } from '@usevibejs/ui/tooling';
