import { nextTick } from '@vibejs-org/ui';
import { expect, test } from 'vitest';
import { mountForTest } from './mount.ts';
import { defineAbiSuite, type AbiSuite } from './suite.ts';

/** The form's fields in template order. */
function fields(el: Element) {
  const inputs = [...el.querySelectorAll('input')];
  const [name, city, age, agree, answer, tagA, tagB, flag, small, medium] = inputs;
  const [color, counts] = [...el.querySelectorAll('select')];
  return {
    name,
    city,
    age,
    note: el.querySelector('textarea')!,
    agree,
    answer,
    tagA,
    tagB,
    flag,
    small,
    medium,
    color,
    counts,
    thanks: el.querySelector('p')!,
  };
}

function type(input: HTMLInputElement | HTMLTextAreaElement, value: string, event = 'input') {
  input.value = value;
  input.dispatchEvent(new Event(event));
}

function toggle(input: HTMLInputElement) {
  input.checked = !input.checked;
  input.dispatchEvent(new Event('change'));
}

export const FormSuite: AbiSuite = defineAbiSuite('Form', (load) => {
  test('text models: plain, lazy, number and trim', async () => {
    const def = await load();
    const { el, unmount } = mountForTest(def);
    const f = fields(el);
    expect(f.age.value).toBe('0');
    type(f.name, 'Ada');
    type(f.city, 'Oslo');
    type(f.age, '42');
    type(f.note, '  hi  ');
    type(f.note, '  hi  ', 'change');
    await nextTick();
    expect(f.name.value).toBe('Ada');
    expect(f.note.value).toBe('hi');
    // `lazy` waits for `change`.
    type(f.city, 'Rome', 'change');
    await nextTick();
    expect(f.city.value).toBe('Rome');
    unmount();
  });

  test('checkbox models: boolean, true-value, array and Set; v-show follows agree', async () => {
    const { el, unmount } = mountForTest(await load());
    const f = fields(el);
    expect(f.thanks.style.display).toBe('none');
    toggle(f.agree);
    await nextTick();
    expect(f.thanks.style.display).toBe('');
    // One change per tick, as a user clicks: an array model is read back after each update.
    toggle(f.answer);
    toggle(f.tagB);
    toggle(f.flag);
    await nextTick();
    toggle(f.tagA);
    await nextTick();
    expect([f.answer.checked, f.tagA.checked, f.tagB.checked, f.flag.checked]).toEqual([
      true,
      true,
      true,
      true,
    ]);
    toggle(f.tagB);
    toggle(f.answer);
    await nextTick();
    expect([f.answer.checked, f.tagB.checked]).toEqual([false, false]);
    unmount();
  });

  test('radio and select models', async () => {
    const { el, unmount } = mountForTest(await load());
    const f = fields(el);
    await nextTick();
    expect([f.small.checked, f.medium.checked]).toEqual([false, true]);
    expect(f.color.value).toBe('red');
    toggle(f.small);
    f.color.value = 'blue';
    f.color.dispatchEvent(new Event('change'));
    f.counts.options[1].selected = true;
    f.counts.dispatchEvent(new Event('change'));
    await nextTick();
    expect([f.small.checked, f.medium.checked]).toEqual([true, false]);
    expect(f.color.value).toBe('blue');
    expect([...f.counts.selectedOptions].map((o) => o.value)).toEqual(['2']);
    unmount();
  });
});
