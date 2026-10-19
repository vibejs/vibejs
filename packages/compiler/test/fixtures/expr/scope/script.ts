import { ref } from '@vibejs-org/ui';
import TodoItem from './TodoItem.vibe';
const _defaults = { items: () => ([]) }
function _setup(__props: any, __ctx: any) {





const count = ref(0);
const emit = __ctx.emit;

return { count, emit }
}
