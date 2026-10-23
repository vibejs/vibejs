import { child as _child, createFor as _createFor, insert as _insert, on as _on, renderEffect as _renderEffect, setText as _setText, template as _template, toDisplayString as _toDisplayString, txt as _txt } from '@usevibejs/ui/internal'
import { ref } from '@usevibejs/ui'
function _setup(__props: any, __ctx: any) {


const label = ref('🎉 ok')
const items = ref(['α', '🚀'])

return { label, items }
}
const _t0 = _template("<p title=\"😀\"> </p>")
const _t1 = _template("<li> </li>")
const _t2 = _template("<ul><!></ul>")
function _render($setup: any, $props: any, $ctx: any) {
  const _n1 = _t0()
  const _n0 = _txt(_n1)
  _renderEffect(() => _setText(_n0, "😀 " + _toDisplayString($setup.label) + " 🚀 " + _toDisplayString($setup.label.length)))
  const _n5 = _t2()
  const _n6 = _child(_n5)
  const _n4 = _createFor(() => $setup.items, (_for0) => {
    const _n2 = _t1()
    const _n3 = _txt(_n2)
    _on(_n2, "click", ($event) => { const item = _for0.value; $setup.label = `🎯 ${item}` })
    _renderEffect(() => { const item = _for0.value; _setText(_n3, "🌍 " + _toDisplayString(item)) })
    return _n2
  }, (item) => item)
  _insert(_n4, _n5, _n6)
  return [_n1, _n5]
}
const _sfc = { setup: _setup, render: _render }
export default _sfc
