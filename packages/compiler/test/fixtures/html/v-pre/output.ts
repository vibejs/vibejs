import { template as _template } from '@usevibejs/ui/internal'
const _t0 = _template("<div :a=\"x\" @b=\"y\" v-if>{{ raw }} <p :c.d=\"e\"></p></div>")
function _render($setup: any, $props: any, $ctx: any) {
  const _n0 = _t0()
  return _n0
}
const _sfc = { render: _render }
export default _sfc
