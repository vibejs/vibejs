import { globSync, readFileSync } from 'node:fs';
import * as internal from '@vibejs-org/ui/internal';
import { parseSync } from 'oxc-parser';
import { describe, expect, it } from 'vitest';

/** Every C3 helper the compiler can emit: all of C3 except `hmr`, which the Vite plugin adds. */
const C3 = [
  'template',
  'child',
  'next',
  'nthChild',
  'txt',
  'renderEffect',
  'setText',
  'setAttr',
  'setProp',
  'setClass',
  'setStyle',
  'setHtml',
  'setDynamicProps',
  'toDisplayString',
  'on',
  'withModifiers',
  'withKeys',
  'insert',
  'createIf',
  'createKeyed',
  'createFor',
  'createComponent',
  'createDynamicComponent',
  'createSlot',
  'applyVShow',
  'applyTextModel',
  'applyCheckboxModel',
  'applyRadioModel',
  'applySelectModel',
  'useModel',
  'setRef',
];
const ABI = '@vibejs-org/ui/internal';

const root = new URL('../test/fixtures/', import.meta.url);
const outputs = globSync('*/*/output{,.dev}.ts', { cwd: root }).map((file) => {
  const dir = file.replaceAll('\\', '/').replace(/[^/]*$/, '');
  return {
    file,
    code: readFileSync(new URL(file, root), 'utf8'),
    input: readFileSync(new URL(`${dir}input.vibe`, root), 'utf8'),
  };
});

/** The ABI names of the first line, and the other imports of `code`. */
function importsOf(code: string): { names: string[]; others: string[] } {
  const { program } = parseSync('output.ts', code, { lang: 'ts' });
  const names: string[] = [];
  const others: string[] = [];
  for (const node of program.body) {
    if (node.type !== 'ImportDeclaration') continue;
    if (node.source.value !== ABI || node.start !== 0) {
      others.push(code.slice(node.start, node.end));
      continue;
    }
    for (const s of node.specifiers) {
      if (s.type !== 'ImportSpecifier' || s.imported.type !== 'Identifier') throw new Error(s.type);
      expect(s.local.name).toBe(`_${s.imported.name}`);
      names.push(s.imported.name);
    }
  }
  return { names, others };
}

const imported = outputs.map((o) => ({ ...o, ...importsOf(o.code) }));
const used = new Set(imported.flatMap((o) => o.names));

describe('the ABI imports of the output.ts fixtures', () => {
  it('reads every output.ts and output.dev.ts', () => {
    expect(outputs.length).toBeGreaterThanOrEqual(10);
  });

  it.each([...used].toSorted())('%s is a function export of @vibejs-org/ui/internal', (name) => {
    const type = typeof Reflect.get(internal, name);
    expect(type).toBe('function');
  });

  it('imports every C3 helper the compiler can emit, and nothing else', () => {
    expect([...used].toSorted()).toStrictEqual(C3.toSorted());
  });

  it.each(imported.map((o) => [o.file, o] as const))(
    '%s imports exactly the helpers it calls',
    (_, { code, names }) => {
      const called = new Set(
        [...code.matchAll(/\b_([A-Za-z]+)\(/g)].map((m) => m[1]).filter((n) => C3.includes(n)),
      );
      expect(names.toSorted()).toStrictEqual([...called].toSorted());
    },
  );

  it.each(imported.map((o) => [o.file, o] as const))(
    '%s imports from no other module than the input script does',
    (_, { input, others }) => {
      for (const statement of others) expect(input).toContain(statement);
    },
  );
});
