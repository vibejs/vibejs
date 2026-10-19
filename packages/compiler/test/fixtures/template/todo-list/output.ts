import { applyTextModel as _applyTextModel, child as _child, createComponent as _createComponent, createFor as _createFor, createIf as _createIf, insert as _insert, next as _next, nthChild as _nthChild, renderEffect as _renderEffect, setText as _setText, template as _template, toDisplayString as _toDisplayString, txt as _txt } from '@vibejs-org/ui/internal'
import { ref, computed } from '@vibejs-org/ui'
import TodoItem from './TodoItem.vibe'
import type { Todo } from './types'
const _defaults = { title: () => 'Todos' }
function _setup(__props: any, __ctx: any) {





const emit = __ctx.emit
const filter = ref('')
const visible = computed(() => __props.todos.filter((t) => t.text.includes(filter.value)))

return { emit, filter, visible }
}
const _t0 = _template("<ul data-vb-0a1b2c3d><!></ul>")
const _t1 = _template("<p class=\"empty\" data-vb-0a1b2c3d>Nothing to do</p>")
const _t2 = _template("<section class=\"todos\" data-vb-0a1b2c3d><h2 data-vb-0a1b2c3d> </h2><input placeholder=\"Filter\" data-vb-0a1b2c3d><!></section>")
function _render($setup: any, $props: any, $ctx: any) {
  const _n8 = _t2()
  const _n6 = _txt(_child(_n8))
  const _n7 = _nthChild(_n8, 1)
  const _n9 = _next(_n7)
  _renderEffect(() => _setText(_n6, _toDisplayString($props.title) + " (" + _toDisplayString($setup.visible.length) + ")"))
  _applyTextModel(_n7, () => $setup.filter, ($event) => { $setup.filter = $event }, { trim: true })
  const _n4 = _createIf(() => $setup.visible.length, () => {
    const _n2 = _t0()
    const _n3 = _child(_n2)
    const _n1 = _createFor(() => $setup.visible, (_for0) => {
      const _n0 = _createComponent(TodoItem, {
        todo: () => { const todo = _for0.value; return todo },
        done: () => true,
        onToggle: () => ($event) => { const todo = _for0.value; $setup.emit('toggle', todo.id) },
      })
      return _n0
    }, (todo) => todo.id)
    _insert(_n1, _n2, _n3)
    return _n2
  }, () => {
    const _n5 = _t1()
    return _n5
  })
  _insert(_n4, _n8, _n9)
  return _n8
}
const _sfc = { __scopeId: "data-vb-0a1b2c3d", __propKeys: ["title", "todos"], __emits: ["toggle"], __defaults: _defaults, setup: _setup, render: _render }
export default _sfc
