import { ref, useTemplateRef } from '@vibejs-org/ui'
import Item from './Item.vibe'
function _setup(__props: any, __ctx: any) {




const text = ref('')
const items = ref([{ id: 1, done: false }])
const fixed = { a: 1 }
let count = 0

return { text, items, fixed, get count() { return count }, set count(v) { count = v } }
}
