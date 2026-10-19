const _defaults = { open: () => false }
function _setup(__props: any, __ctx: any) {

const value = _useModel(__props, "modelValue");
const [count, modifiers] = _useModel(__props, "count");
const open = _useModel(__props, "open");

function reset() {
  value.value = '';
  count.value = modifiers.trim ? 0 : count.value;
  open.value = false;
}

return { value, count, modifiers, open, reset }
}
