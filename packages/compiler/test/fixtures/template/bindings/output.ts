import { child as _child, createKeyed as _createKeyed, insert as _insert, next as _next, renderEffect as _renderEffect, setAttr as _setAttr, setDynamicProps as _setDynamicProps, setStyle as _setStyle, setText as _setText, template as _template, toDisplayString as _toDisplayString, txt as _txt } from '@vibejs-org/ui/internal'
import { ref } from '@vibejs-org/ui'
function _setup(__props: any, __ctx: any) {


const color = ref('red')
const attrs = ref({ id: 'main' })
const name = ref('title')
const version = ref(1)

return { color, attrs, name, version }
}
const _t0 = _template("<section><h1> </h1></section>")
const _t1 = _template("<main><svg></svg><p>styled</p><div></div><!></main>")
function _render($setup: any, $props: any, $ctx: any) {
  const _n6 = _t1()
  const _n3 = _child(_n6)
  const _n4 = _next(_n3)
  const _n5 = _next(_n4)
  const _n7 = _next(_n5)
  _renderEffect(() => _setAttr(_n3, "viewBox", '0 0 10 10'))
  _renderEffect(() => _setAttr(_n3, "data-color", $setup.color))
  _renderEffect(() => _setStyle(_n4, (["margin: 0", ({ color: $setup.color })])))
  _renderEffect(() => _setDynamicProps(_n5, ([{ "class": ("box") }, ($setup.attrs), { [$setup.name]: ($setup.color), "title": ("static") }])))
  const _n2 = _createKeyed(() => $setup.version, () => {
    const _n1 = _t0()
    const _n0 = _txt(_child(_n1))
    _renderEffect(() => _setText(_n0, "v" + _toDisplayString($setup.version)))
    return _n1
  })
  _insert(_n2, _n6, _n7)
  return _n6
}
const _sfc = { setup: _setup, render: _render }
export default _sfc
