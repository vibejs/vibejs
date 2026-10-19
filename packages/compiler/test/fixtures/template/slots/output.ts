import { createComponent as _createComponent, createSlot as _createSlot, renderEffect as _renderEffect, setText as _setText, template as _template, toDisplayString as _toDisplayString, txt as _txt } from '@vibejs-org/ui/internal'
import { ref } from '@vibejs-org/ui'
import Card from './Card.vibe'
import List from './List.vibe'
function _setup(__props: any, __ctx: any) {




const open = ref(false)
const rows = ref([{ id: 1, name: 'a' }])

return { open, rows }
}
const _t0 = _template("<h3> </h3>")
const _t1 = _template("No footer")
const _t2 = _template(" ")
function _render($setup: any, $props: any, $ctx: any) {
  const _n0 = _createComponent(Card, { $: [() => ({ title: "Rows" }), () => $ctx.attrs] }, {
    header: (_slot0) => {
      const _n2 = _t0()
      const _n1 = _txt(_n2)
      _renderEffect(() => { const { count } = _slot0; _setText(_n1, _toDisplayString(count) + " rows") })
      return _n2
    },
    default: () => {
      const _n5 = _createComponent(List, {
        items: () => $setup.rows,
      }, {
        item: (_slot1) => {
          const _n6 = _t2()
          _renderEffect(() => { const { item } = _slot1; _setText(_n6, _toDisplayString(item.name)) })
          return _n6
        },
      })
      return _n5
    },
    $: [
      () => ($setup.open ? { name: "footer", fn: () => {
        const _n4 = _createSlot("footer", {
          rows: () => $setup.rows,
        }, () => {
          const _n3 = _t1()
          return _n3
        })
        return _n4
      } } : null),
    ],
  }, true)
  return _n0
}
const _sfc = { setup: _setup, render: _render }
export default _sfc
