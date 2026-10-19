import { ref } from '@vibejs-org/ui'
import Card from './Card.vibe'
import List from './List.vibe'
function _setup(__props: any, __ctx: any) {




const open = ref(false)
const rows = ref([{ id: 1, name: 'a' }])

return { open, rows }
}
