import { ref, useTemplateRef } from '@vibejs-org/ui'
function _setup(__props: any, __ctx: any) {


const form = ref({ name: '', agree: false, size: 1, kind: 'a' })
const field = useTemplateRef('field')
const tags = ref(['x'])
function submit() {}

return { form, field, tags, submit }
}
