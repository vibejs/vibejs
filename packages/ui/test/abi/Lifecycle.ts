// The compiled twin of Lifecycle.vibe, written as the compiler emits it (types added).
import {
  onBeforeMount,
  onBeforeUnmount,
  onBeforeUpdate,
  onErrorCaptured,
  onMounted,
  onUnmounted,
  onUpdated,
  ref,
} from '@vibejs-org/ui';
import {
  child,
  createComponent,
  insert,
  next,
  on,
  renderEffect,
  setText,
  template,
  toDisplayString,
  txt,
  type ComponentDef,
} from '@vibejs-org/ui/internal';
import { Leaf } from './Leaf.ts';

type Props = {
  log: string[];
};

const t0 = template('<div><button type="button"> </button><!----></div>');

export const Lifecycle: ComponentDef = {
  name: 'Lifecycle',
  __file: 'test/abi/Lifecycle.vibe',
  __propKeys: ['log'],
  setup(__props: Props) {
    const count = ref(0);
    onBeforeMount(() => __props.log.push('root beforeMount'));
    onMounted(() => __props.log.push('root mounted'));
    onBeforeUpdate(() => __props.log.push('root beforeUpdate'));
    onUpdated(() => __props.log.push('root updated'));
    onBeforeUnmount(() => __props.log.push('root beforeUnmount'));
    onUnmounted(() => __props.log.push('root unmounted'));
    onErrorCaptured((err, instance, info) => {
      __props.log.push(`captured ${(err as Error).message} from ${instance?.name} in ${info}`);
      return false;
    });
    return { count };
  },
  render($setup: { count: number }, $props: Props) {
    const n0 = t0() as Element;
    const n1 = child(n0);
    const x1 = txt(n1);
    const a0 = next(n1);
    on(n1, 'click', () => $setup.count++);
    renderEffect(() => setText(x1, toDisplayString($setup.count)));
    insert(createComponent(Leaf, { log: () => $props.log, count: () => $setup.count }), n0, a0);
    return n0;
  },
};
