import { on as _on, renderEffect as _renderEffect, setText as _setText, template as _template, toDisplayString as _toDisplayString, txt as _txt } from '@vibejs-org/ui/internal'
import { ref } from '@vibejs-org/ui';
function _setup(__props: any, __ctx: any) {



const count = ref(0);

return { count }
}
const _t0 = _template("<button type=\"button\" data-vb-0a1b2c3d> </button>")
function _render($setup: any, $props: any, $ctx: any) {
  const _n0 = _t0()
  const _n1 = _txt(_n0)
  _on(_n0, "click", ($event) => { $setup.count++ })
  _renderEffect(() => _setText(_n1, "Clicked " + _toDisplayString($setup.count) + " times"))
  return _n0
}
const _sfc = { __scopeId: "data-vb-0a1b2c3d", setup: _setup, render: _render }
export default _sfc
