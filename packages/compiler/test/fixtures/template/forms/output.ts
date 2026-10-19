import { applyCheckboxModel as _applyCheckboxModel, applyRadioModel as _applyRadioModel, applySelectModel as _applySelectModel, applyTextModel as _applyTextModel, applyVShow as _applyVShow, child as _child, createFor as _createFor, insert as _insert, next as _next, on as _on, renderEffect as _renderEffect, setClass as _setClass, setHtml as _setHtml, setProp as _setProp, setRef as _setRef, setText as _setText, template as _template, toDisplayString as _toDisplayString, txt as _txt, withKeys as _withKeys, withModifiers as _withModifiers } from '@vibejs-org/ui/internal'
import { ref, useTemplateRef } from '@vibejs-org/ui'
function _setup(__props: any, __ctx: any) {


const form = ref({ name: '', agree: false, size: 1, kind: 'a' })
const field = useTemplateRef('field')
const tags = ref(['x'])
function submit() {}

return { form, field, tags, submit }
}
const _t0 = _template("<span> </span>")
const _t1 = _template("<form><input><textarea></textarea><label><input type=\"checkbox\"> Agree</label><input type=\"radio\" value=\"a\"><select><option>One</option></select><p></p><div></div><!></form>")
function _render($setup: any, $props: any, $ctx: any) {
  const _n0 = _t1()
  const _n4 = _child(_n0)
  const _n5 = _next(_n4)
  const _n6 = _child(_next(_n5))
  const _n7 = _next(_next(_n5))
  const _n8 = _next(_n7)
  const _n9 = _child(_n8)
  const _n10 = _next(_n8)
  const _n11 = _next(_n10)
  const _n12 = _next(_n11)
  _on(_n0, "submit", _withModifiers((...args) => $setup.submit(...args), ["prevent"]))
  _setRef(_n4, "field", false)
  _applyTextModel(_n4, () => $setup.form.name, ($event) => { $setup.form.name = $event }, { lazy: true })
  _applyTextModel(_n5, () => $setup.form.name, ($event) => { $setup.form.name = $event }, { trim: true })
  _applyCheckboxModel(_n6, () => $setup.form.agree, ($event) => { $setup.form.agree = $event }, { true: () => "yes", false: () => "no" })
  _applyRadioModel(_n7, () => $setup.form.kind, ($event) => { $setup.form.kind = $event })
  _applySelectModel(_n8, () => $setup.form.size, ($event) => { $setup.form.size = $event }, { number: true })
  _renderEffect(() => _setProp(_n9, "value", 1))
  _applyVShow(_n10, () => $setup.form.agree)
  _renderEffect(() => _setText(_n10, _toDisplayString($setup.form.name)))
  _renderEffect(() => _setHtml(_n11, $setup.form.name))
  const _n3 = _createFor(() => $setup.tags, (_for0, _for0k) => {
    const _n1 = _t0()
    const _n2 = _txt(_n1)
    _on(_n1, "keydown", _withKeys(_withModifiers(($event) => { const tag = _for0.value; const i = _for0k.value; $setup.tags.splice(i, 1) }, ["ctrl"]), ["enter"]))
    _renderEffect(() => { const tag = _for0.value; const i = _for0k.value; _setClass(_n1, ({ first: i === 0 })) })
    _renderEffect(() => { const tag = _for0.value; const i = _for0k.value; _setText(_n2, _toDisplayString(tag)) })
    return _n1
  }, (tag, i) => tag)
  _insert(_n3, _n0, _n12)
  return _n0
}
const _sfc = { setup: _setup, render: _render }
export default _sfc
