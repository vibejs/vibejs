import { describe, expect, it } from 'vitest';
import { analyzeFile } from '../../test/script.ts';
import { run, sfc } from '../../test/transform.ts';
import { componentName, resolveComponentTag } from './resolve.ts';

const { analysis } = analyzeFile(sfc(''));

describe('resolveComponentTag', () => {
  it.each([
    ['import', 'Item', 'Item'],
    ['setup binding', 'Local', 'Local'],
    ['dotted', 'Form.Input', 'Form.Input'],
    ['lowercase dotted root', 'form.Input', null],
    ['self name', 'List', 'List'],
    ['unknown PascalCase', 'Missing', null],
    ['kebab', 'item', null],
    ['custom element', 'my-item', null],
    ['built-in name', 'Teleport', null],
  ])('%s: %s', (_, tag, expected) => {
    expect(resolveComponentTag(tag, analysis, 'src/List.vibe')).toBe(expected);
  });

  it('resolves a self name shadowed by a binding to the binding', () => {
    expect(resolveComponentTag('Item', analysis, 'src\\Item.vibe')).toBe('Item');
    const { ir } = run(sfc('<Item />'), 'src/Item.vibe');
    expect(ir!.block.ops[0]).toMatchObject({ make: { k: 'component', is: 'Item' } });
  });

  it('reads the file name on any path separator', () => {
    expect(componentName('a/b\\TodoList.vibe')).toBe('TodoList');
    expect(componentName('TodoList.vibe')).toBe('TodoList');
  });
});

describe('tag diagnostics', () => {
  it.each([
    ['<Item />', []],
    ['<Local />', []],
    ['<Form.Input />', []],
    ['<List />', []],
    ['<my-item></my-item>', []],
    ['<div></div><circle /><mi></mi>', []],
    ['<item />', ['VIBE2002']],
    ['<form-input />', []],
    ['<local></local>', ['VIBE2002']],
    ['<form></form>', []],
    ['<list></list>', ['VIBE2003']],
    ['<widget />', ['VIBE2003']],
    ['<Missing />', ['VIBE2001']],
    ['<Teleport />', ['VIBE2901']],
    ['<KeepAlive />', ['VIBE2902']],
    ['<Transition />', ['VIBE2903']],
    ['<TransitionGroup />', ['VIBE2904']],
    ['<Suspense />', ['VIBE2905']],
  ])('%s', (template, codes) => {
    expect(run(sfc(template)).diagnostics.map((d) => d.code)).toStrictEqual(codes);
  });

  it('never reports a native element that shares the file name', () => {
    expect(run(sfc('<button></button>'), 'src/Button.vibe').diagnostics).toStrictEqual([]);
  });

  it('names the PascalCase tag in the fix of VIBE2002', () => {
    const [d] = run(sfc('<local />')).diagnostics;
    expect(d.message).toBe(
      '`<local>` refers to the component `Local`, and component tags are written in PascalCase.',
    );
    expect(d.fixes).toStrictEqual(['Write the tag as `<Local>`.']);
  });
});
