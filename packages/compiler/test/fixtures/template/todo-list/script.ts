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
