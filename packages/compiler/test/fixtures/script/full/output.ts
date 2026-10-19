import { child as _child, createFor as _createFor, insert as _insert, on as _on, renderEffect as _renderEffect, setRef as _setRef, setText as _setText, template as _template, toDisplayString as _toDisplayString, txt as _txt, useModel as _useModel } from '@vibejs-org/ui/internal'
import { computed, ref, useTemplateRef } from '@vibejs-org/ui';
import type { Item } from './types';
import Child from './Child.vibe';
export interface Props {
  title: string;
  items?: Item[];
  size?: 'small' | 'large';
}
const _defaults = { items: () => ([]), size: () => 'small', query: () => '' }
function _setup(__props: any, __ctx: any) {








const emit = __ctx.emit;
const slots = __ctx.slots;
const [query, queryModifiers] = _useModel(__props, "query");
const checked = _useModel(__props, "modelValue");

let clicks = 0;
const label = computed(() => `${__props.title} (${__props.size})`);
const list = useTemplateRef<HTMLUListElement>('list');
const input = useTemplateRef('input');

function pick(id: number) {
  clicks++;
  emit('pick', id);
}

__ctx.expose({ pick, items: __props.items });


return { emit, slots, query, queryModifiers, checked, get clicks() { return clicks }, set clicks(v) { clicks = v }, label, list, input, pick }
}
const _t0 = _template("<li> </li>")
const _t1 = _template("<ul><!></ul>")
function _render($setup: any, $props: any, $ctx: any) {
  const _n0 = _t1()
  const _n4 = _child(_n0)
  _setRef(_n0, "list", false)
  const _n3 = _createFor(() => $props.items, (_for0) => {
    const _n1 = _t0()
    const _n2 = _txt(_n1)
    _on(_n1, "click", ($event) => { const item = _for0.value; $setup.pick(item.id) })
    _renderEffect(() => { const item = _for0.value; _setText(_n2, _toDisplayString($setup.label) + " " + _toDisplayString(item.text)) })
    return _n1
  }, (item) => item.id)
  _insert(_n3, _n0, _n4)
  return _n0
}
const _sfc = { name: "ItemList", __propKeys: ["title", "items", "size", "query", "queryModifiers", "modelValue", "modelValueModifiers"], __emits: ["pick", "close", "update:query", "update:modelValue"], __defaults: _defaults, inheritAttrs: false, setup: _setup, render: _render }
export default _sfc
