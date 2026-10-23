import { on as _on, template as _template } from '@usevibejs/ui/internal'
function _setup(__props: any, __ctx: any) {

interface Events {
  save: [id: number];
  'update:title': [title: string];
}
interface Events {
  close: [];
}

const emit = __ctx.emit;

return { emit }
}
const _t0 = _template("<button>Save</button>")
function _render($setup: any, $props: any, $ctx: any) {
  const _n0 = _t0()
  _on(_n0, "click", ($event) => { $setup.emit('save', 1) })
  return _n0
}
const _sfc = { __emits: ["save", "update:title", "close"], setup: _setup, render: _render }
export default _sfc
