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
