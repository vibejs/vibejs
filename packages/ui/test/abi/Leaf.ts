// The compiled twin of Leaf.vibe, written as the compiler emits it (types added).
import {
  onBeforeMount,
  onBeforeUnmount,
  onBeforeUpdate,
  onMounted,
  onUnmounted,
  onUpdated,
} from '@vibejs-org/ui';
import {
  on,
  renderEffect,
  setText,
  template,
  toDisplayString,
  txt,
  type ComponentDef,
} from '@vibejs-org/ui/internal';

type Props = {
  log: string[];
  count: number;
};

const t0 = template('<span> </span>');

export const Leaf: ComponentDef = {
  name: 'Leaf',
  __file: 'test/abi/Leaf.vibe',
  __propKeys: ['log', 'count'],
  setup(__props: Props) {
    onBeforeMount(() => __props.log.push('leaf beforeMount'));
    onMounted(() => __props.log.push('leaf mounted'));
    onBeforeUpdate(() => __props.log.push('leaf beforeUpdate'));
    onUpdated(() => __props.log.push('leaf updated'));
    onBeforeUnmount(() => __props.log.push('leaf beforeUnmount'));
    onUnmounted(() => __props.log.push('leaf unmounted'));
    function fail() {
      throw new Error('leaf failed');
    }
    return { fail };
  },
  render($setup: { fail: () => void }, $props: Props) {
    const n0 = t0();
    const x0 = txt(n0);
    on(n0, 'click', () => $setup.fail());
    renderEffect(() => setText(x0, toDisplayString($props.count)));
    return n0;
  },
};
