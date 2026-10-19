import { child as _child, createComponent as _createComponent, createDynamicComponent as _createDynamicComponent, createSlot as _createSlot, insert as _insert, next as _next, template as _template } from '@vibejs-org/ui/internal'
import { ref, shallowRef } from '@vibejs-org/ui'
import Field from './Field.vibe'
import Panel from './Panel.vibe'
function _setup(__props: any, __ctx: any) {




const view = shallowRef(Panel)
const text = ref('')
const extra = ref({ hint: 'Type here' })
const expanded = ref(false)

return { view, text, extra, expanded }
}
const _t0 = _template("Expanded")
const _t1 = _template("Collapsed")
const _t2 = _template("<em>Empty</em>")
const _t3 = _template("<div><!><!><!></div>")
function _render($setup: any, $props: any, $ctx: any) {
  const _n7 = _t3()
  const _n8 = _child(_n7)
  const _n9 = _next(_n8)
  const _n10 = _next(_n9)
  const _n0 = _createDynamicComponent(() => $setup.view, {
    title: () => $setup.text,
  })
  _insert(_n0, _n7, _n8)
  const _n1 = _createComponent(Field, { $: [() => $setup.extra, () => ({ modelValue: $setup.text, "onUpdate:modelValue": ($event) => { $setup.text = $event }, modelValueModifiers: ({ "trim": true }), label: "Name", onBlur: ($event) => { $setup.expanded = false } })] })
  _insert(_n1, _n7, _n9)
  const _n2 = _createComponent(Panel, {}, {
    default: () => {
      const _n6 = _createSlot("body", { $: [() => $setup.extra, () => ({ size: $setup.text.length })] }, () => {
        const _n5 = _t2()
        return _n5
      })
      return _n6
    },
    $: [
      () => ($setup.expanded ? { name: "summary", fn: () => {
        const _n3 = _t0()
        return _n3
      } } : null),
      () => (!($setup.expanded) ? { name: "summary", fn: () => {
        const _n4 = _t1()
        return _n4
      } } : null),
    ],
  })
  _insert(_n2, _n7, _n10)
  return _n7
}
const _sfc = { setup: _setup, render: _render }
export default _sfc
