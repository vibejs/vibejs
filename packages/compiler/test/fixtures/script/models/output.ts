import { applyTextModel as _applyTextModel, template as _template, useModel as _useModel } from '@vibejs-org/ui/internal'
const _defaults = { open: () => false }
function _setup(__props: any, __ctx: any) {

const value = _useModel(__props, "modelValue");
const [count, modifiers] = _useModel(__props, "count");
const open = _useModel(__props, "open");

function reset() {
  value.value = '';
  count.value = modifiers.trim ? 0 : count.value;
  open.value = false;
}

return { value, count, modifiers, open, reset }
}
const _t0 = _template("<input>")
function _render($setup: any, $props: any, $ctx: any) {
  const _n0 = _t0()
  _applyTextModel(_n0, () => $setup.value, ($event) => { $setup.value = $event })
  return _n0
}
const _sfc = { __propKeys: ["modelValue", "modelValueModifiers", "count", "countModifiers", "open", "openModifiers"], __emits: ["update:modelValue", "update:count", "update:open"], __defaults: _defaults, setup: _setup, render: _render }
export default _sfc
