// The compiled twin of Item.vibe, written as the compiler emits it (types added).
import {
  renderEffect,
  setClass,
  setText,
  template,
  toDisplayString,
  txt,
  type ComponentDef,
} from '@usevibejs/ui/internal';

type Props = {
  index: number;
  label: string;
  done: boolean;
};

const t0 = template('<li> </li>');

export const Item: ComponentDef = {
  name: 'Item',
  __file: 'test/abi/Item.vibe',
  __propKeys: ['index', 'label', 'done'],
  render(_$setup, $props: Props) {
    const n0 = t0() as Element;
    const x0 = txt(n0);
    renderEffect(() => setClass(n0, { done: $props.done }));
    renderEffect(() =>
      setText(x0, toDisplayString($props.index + 1) + '. ' + toDisplayString($props.label)),
    );
    return n0;
  },
};
