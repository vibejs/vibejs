import { watch } from '@vibejs-org/ui';
const _defaults = { "data-id": () => 'x' }
function _setup(__props: any, __ctx: any) {





const total = () => __props.a + __props.b;
const shadow = (a: number) => a + __props.b;
const pair = { a: __props.a, renamed: __props.b, dataId: __props["data-id"] };
try {
  JSON.parse(__props["data-id"]);
} catch (a) {
  console.log(a);
}
{
  const renamed = 1;
  console.log(renamed, __props.a);
}
watch(() => __props.a, (value) => console.log(value, shadow(value), pair));

return { total, shadow, pair }
}
