import { child as _child, createComponent as _createComponent, createFor as _createFor, createIf as _createIf, insert as _insert, on as _on, renderEffect as _renderEffect, setAttr as _setAttr, setText as _setText, template as _template, toDisplayString as _toDisplayString, txt as _txt } from '@vibejs-org/ui/internal'
import { ref } from '@vibejs-org/ui';
import TodoItem from './TodoItem.vibe';
const _defaults = { items: () => ([]) }
function _setup(__props: any, __ctx: any) {





const count = ref(0);
const emit = __ctx.emit;

return { count, emit }
}
const _t0 = _template(" ")
const _t1 = _template("<ul><!></ul>")
const _t2 = _template("<p> </p>")
const _t3 = _template("<h1> </h1>")
function _render($setup: any, $props: any, $ctx: any) {
  const _n8 = _t3()
  const _n9 = _txt(_n8)
  _renderEffect(() => _setAttr(_n8, "title", `${$props.title} (${$props.items.length})`))
  _renderEffect(() => _setText(_n9, _toDisplayString($props.title.toUpperCase()) + " 😀 " + _toDisplayString($setup.count * 2)))
  const _n5 = _createIf(() => $props.items.length > 0 && $setup.count !== -1, () => {
    const _n3 = _t1()
    const _n4 = _child(_n3)
    const _n2 = _createFor(() => $props.items, (_for0, _for0k) => {
      const _n0 = _createComponent(TodoItem, {
        todo: () => { const { id, text } = _for0.value; const index = _for0k.value; return ({ id, text, index } as const) },
        onSelect: () => (value: number) => $setup.emit('select', value),
        onRemove: () => ($event) => { $setup.count++; $ctx.emit('remove', $event) },
      }, {
        default: (_slot0) => {
          const _n1 = _t0()
          _renderEffect(() => { const { id, text } = _for0.value; const index = _for0k.value; { const { done = false } = _slot0; _setText(_n1, _toDisplayString(done ? '✓' : text!.trim())) } })
          return _n1
        },
      })
      return _n0
    }, ({ id, text }, index) => id)
    _insert(_n2, _n3, _n4)
    return _n3
  }, () => {
    const _n6 = _t2()
    const _n7 = _txt(_n6)
    _on(_n6, "click", ($event) => { $setup.count = Math.max(0, $setup.count - 1) })
    _renderEffect(() => _setText(_n7, (_toDisplayString($props.items.map((item) => item.text).join(', ')))))
    return _n6
  })
  return [_n8, _n5]
}
const _sfc = { __propKeys: ["title", "items"], __emits: ["select"], __defaults: _defaults, setup: _setup, render: _render }
export default _sfc
