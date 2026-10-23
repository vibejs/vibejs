// The compiled twin of Form.vibe, written as the compiler emits it (types added).
import { ref } from '@usevibejs/ui';
import {
  applyCheckboxModel,
  applyRadioModel,
  applySelectModel,
  applyTextModel,
  applyVShow,
  child,
  next,
  template,
  type ComponentDef,
} from '@usevibejs/ui/internal';

type State = {
  name: string;
  city: string;
  age: number | string;
  note: string;
  agree: boolean;
  answer: 'yes' | 'no';
  tags: string[];
  flags: Set<string>;
  size: string;
  color: string;
  counts: number[];
};

const t0 = template(
  '<form><input><input><input type="number"><textarea></textarea><input type="checkbox"><input type="checkbox" true-value="yes" false-value="no"><input type="checkbox" value="a"><input type="checkbox" value="b"><input type="checkbox" value="x"><input type="radio" value="s"><input type="radio" value="m"><select><option>red</option><option>blue</option></select><select multiple><option value="1">one</option><option value="2">two</option></select><p>Thanks</p></form>',
);

export const Form: ComponentDef = {
  name: 'Form',
  __file: 'test/abi/Form.vibe',
  setup() {
    const name = ref('');
    const city = ref('');
    const age = ref<number | string>(0);
    const note = ref('');
    const agree = ref(false);
    const answer = ref<'yes' | 'no'>('no');
    const tags = ref<string[]>([]);
    const flags = ref(new Set<string>());
    const size = ref('m');
    const color = ref('red');
    const counts = ref<number[]>([]);
    return { name, city, age, note, agree, answer, tags, flags, size, color, counts };
  },
  render($setup: State) {
    const n0 = t0();
    const n1 = child(n0) as HTMLInputElement;
    const n2 = next(n1) as HTMLInputElement;
    const n3 = next(n2) as HTMLInputElement;
    const n4 = next(n3) as HTMLTextAreaElement;
    const n5 = next(n4) as HTMLInputElement;
    const n6 = next(n5) as HTMLInputElement;
    const n7 = next(n6) as HTMLInputElement;
    const n8 = next(n7) as HTMLInputElement;
    const n9 = next(n8) as HTMLInputElement;
    const n10 = next(n9) as HTMLInputElement;
    const n11 = next(n10) as HTMLInputElement;
    const n12 = next(n11) as HTMLSelectElement;
    const n13 = next(n12) as HTMLSelectElement;
    const n14 = next(n13) as HTMLElement;
    applyTextModel(
      n1,
      () => $setup.name,
      (v) => ($setup.name = v as string),
    );
    applyTextModel(
      n2,
      () => $setup.city,
      (v) => ($setup.city = v as string),
      { lazy: true },
    );
    applyTextModel(
      n3,
      () => $setup.age,
      (v) => ($setup.age = v as number),
      { number: true },
    );
    applyTextModel(
      n4,
      () => $setup.note,
      (v) => ($setup.note = v as string),
      { trim: true },
    );
    applyCheckboxModel(
      n5,
      () => $setup.agree,
      (v) => ($setup.agree = v as boolean),
    );
    applyCheckboxModel(
      n6,
      () => $setup.answer,
      (v) => ($setup.answer = v as 'yes' | 'no'),
      {
        true: () => 'yes',
        false: () => 'no',
      },
    );
    applyCheckboxModel(
      n7,
      () => $setup.tags,
      (v) => ($setup.tags = v as string[]),
    );
    applyCheckboxModel(
      n8,
      () => $setup.tags,
      (v) => ($setup.tags = v as string[]),
    );
    applyCheckboxModel(
      n9,
      () => $setup.flags,
      (v) => ($setup.flags = v as Set<string>),
    );
    applyRadioModel(
      n10,
      () => $setup.size,
      (v) => ($setup.size = v as string),
    );
    applyRadioModel(
      n11,
      () => $setup.size,
      (v) => ($setup.size = v as string),
    );
    applySelectModel(
      n12,
      () => $setup.color,
      (v) => ($setup.color = v as string),
    );
    applySelectModel(
      n13,
      () => $setup.counts,
      (v) => ($setup.counts = v as number[]),
      {
        number: true,
      },
    );
    applyVShow(n14, () => $setup.agree);
    return n0;
  },
};
