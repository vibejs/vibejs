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
