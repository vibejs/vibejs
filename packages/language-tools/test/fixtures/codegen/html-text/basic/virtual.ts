
const html = '<b>b</b>'

type __VibeProps = {};
type __VibeEmits = {};
const __vibe_setup = { html };
{
  const { html } = __vibe.unrefs(__vibe_setup);
  __vibe.el(__vibe.tags.div)({ innerHTML: html });
  __vibe.el(__vibe.tags.p)({ textContent: html, 'text-content': html });
}
type __VibeSlots = {};
type __VibeExposed = {};
type __VibeRefs = {};
type __VibeModels = {};
export default __vibe.defineComponent<__VibeProps, __VibeEmits, __VibeSlots, __VibeExposed, __VibeModels>();
import * as __vibe from '@vibejs-org/ui/tooling';
