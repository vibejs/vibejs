import { child as _child, createFor as _createFor, createIf as _createIf, insert as _insert, renderEffect as _renderEffect, setText as _setText, template as _template, toDisplayString as _toDisplayString, txt as _txt } from '@usevibejs/ui/internal'
import { ref } from '@usevibejs/ui'
function _setup(__props: any, __ctx: any) {


const rows = ref([1, 2])
const on = ref(true)

return { rows, on }
}
const _t0 = _template("<tr data-vb-0a1b2c3d><td data-vb-0a1b2c3d> </td></tr>")
const _t1 = _template("<table data-vb-0a1b2c3d><!></table>")
const _t2 = _template("<div data-vb-0a1b2c3d>split</div>")
const _t3 = _template("<p data-vb-0a1b2c3d><!></p>")
const _t4 = _template("<circle r=\"5\" data-vb-0a1b2c3d></circle>", "svg")
const _t5 = _template("<svg viewBox=\"0 0 10 10\" data-vb-0a1b2c3d><!></svg>", "svg")
const _t6 = _template("<math data-vb-0a1b2c3d><mi data-vb-0a1b2c3d>x</mi></math>", "math")
const _t7 = _template("<pre data-vb-0a1b2c3d>{{ raw }}</pre>")
function _render($setup: any, $props: any, $ctx: any) {
  const _n3 = _t1()
  const _n4 = _child(_n3)
  const _n2 = _createFor(() => $setup.rows, (_for0) => {
    const _n1 = _t0()
    const _n0 = _txt(_child(_n1))
    _renderEffect(() => { const row = _for0.value; _setText(_n0, _toDisplayString(row)) })
    return _n1
  }, (row) => row)
  _insert(_n2, _n3, _n4)
  const _n6 = _t3()
  const _n7 = _child(_n6)
  const _n5 = _t2()
  _insert(_n5, _n6, _n7)
  const _n10 = _t5()
  const _n11 = _child(_n10)
  const _n9 = _createIf(() => $setup.on, () => {
    const _n8 = _t4()
    return _n8
  })
  _insert(_n9, _n10, _n11)
  const _n12 = _t6()
  const _n13 = _t7()
  return [_n3, _n6, _n10, _n12, _n13]
}
const _sfc = { __scopeId: "data-vb-0a1b2c3d", setup: _setup, render: _render }
export default _sfc
