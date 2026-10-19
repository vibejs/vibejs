import { eachMapping, originalPositionFor, TraceMap } from '@jridgewell/trace-mapping';
import { describe, expect, it } from 'vitest';
import { fixtures } from '../test/walk.ts';
import { compile } from './compile.ts';

const IDENTIFIER = /^[A-Za-z_$][\w$]*/;
/** Template and node variables, which map to nodes. */
const REFS = /^_[tn]\d+$/;

/**
 * Whether `gen`, which starts with `__props`, reads the prop that the original text `from` names:
 * the key itself, or the local it is destructured to (`key: local`) in `source`.
 */
function readsProp(gen: string, from: string, source: string): boolean {
  const read = /^__props(?:\.([\w$]+)|\[("[^"]*")\])/.exec(gen);
  const local = IDENTIFIER.exec(from)?.[0];
  if (!read || local === undefined) return false;
  const key: string = read[2] ? JSON.parse(read[2]) : read[1];
  return (
    local === key || source.includes(`${key}: ${local}`) || source.includes(`'${key}': ${local}`)
  );
}

const compiled = fixtures.flatMap(([name, source]) => {
  const result = compile(source, { filename: `${name}/input.vibe`, id: '0a1b2c3d', dev: false });
  return result.map ? [{ name, source, code: result.code, map: new TraceMap(result.map) }] : [];
});
const fixture = (name: string) => compiled.find((f) => f.name === name)!;

/** The 1-based line and 0-based column of the `nth` occurrence of `needle` in `text`. */
function locate(text: string, needle: string, nth = 0): { line: number; column: number } {
  let offset = -1;
  for (let i = 0; i <= nth; i++) offset = text.indexOf(needle, offset + 1);
  expect(offset).toBeGreaterThanOrEqual(0);
  const before = text.slice(0, offset).split('\n');
  return { line: before.length, column: before.at(-1)!.length };
}

/** The original position of the `nth` occurrence of `needle` in the generated code. */
function trace(name: string, needle: string, nth = 0) {
  const { code, map } = fixture(name);
  const { line, column } = originalPositionFor(map, locate(code, needle, nth));
  return { line, column };
}

describe('source maps', () => {
  it.each(compiled.map((f) => [f.name, f] as const))(
    '%s maps every segment in bounds, each identifier to itself',
    (_, { source, code, map }) => {
      const generated = code.split('\n');
      const original = source.split('\n');
      const bad: string[] = [];
      // The ABI helpers, as the output imports them; they map to nodes.
      const helpers = new Set([...code.matchAll(/\b\w+ as (_\w+)/g)].map((m) => m[1]));
      eachMapping(map, (m) => {
        const gen = generated.at(m.generatedLine - 1);
        const orig = original.at(m.originalLine! - 1);
        if (gen === undefined || m.generatedColumn > gen.length) {
          bad.push(`generated ${m.generatedLine}:${m.generatedColumn}`);
          return;
        }
        if (orig === undefined || m.originalColumn! > orig.length) {
          bad.push(`original ${m.originalLine}:${m.originalColumn}`);
          return;
        }
        const id = IDENTIFIER.exec(gen.slice(m.generatedColumn))?.[0];
        if (id === undefined || REFS.test(id) || helpers.has(id)) return;
        const from = orig.slice(m.originalColumn!);
        // The rewrites of C3: context names, macros, destructured props and prop aliases.
        const rewritten =
          (id === '$ctx' && /^\$(attrs|slots|emit)/.test(from)) ||
          (id === '__ctx' && /^define[A-Z]/.test(from)) ||
          (id === '__props' && readsProp(gen.slice(m.generatedColumn), from, source));
        if (!from.startsWith(id) && !rewritten)
          bad.push(`${id} at ${m.generatedLine}:${m.generatedColumn} -> ${from.slice(0, 20)}`);
      });
      expect(bad).toStrictEqual([]);
    },
  );

  it('maps an interpolation', () => {
    expect(trace('template/todo-list', 'visible.length')).toStrictEqual(
      locate(fixture('template/todo-list').source, 'visible.length'),
    );
  });

  it('maps a v-for alias in the prelude of a getter', () => {
    const { source } = fixture('template/todo-list');
    expect(trace('template/todo-list', 'todo = _for0.value')).toStrictEqual(
      locate(source, 'todo in'),
    );
  });

  it('maps a v-on statement', () => {
    const { source } = fixture('template/todo-list');
    expect(trace('template/todo-list', "emit('toggle'")).toStrictEqual(
      locate(source, "emit('toggle'"),
    );
  });

  it('maps a hoisted import', () => {
    const { source } = fixture('template/todo-list');
    expect(trace('template/todo-list', 'import TodoItem')).toStrictEqual(
      locate(source, 'import TodoItem'),
    );
  });

  it('maps a rewritten destructured prop to the name as written', () => {
    const { source } = fixture('template/todo-list');
    expect(trace('template/todo-list', '__props.todos')).toStrictEqual(
      locate(source, 'todos.filter'),
    );
  });

  it('gives a CRLF file the line:column of its LF twin, in UTF-16 columns', () => {
    const lf = fixture('template/unicode').source;
    const pairs = [
      ['label)', 'label }}'],
      ['label.length', 'label.length'],
      ['item))', 'item }}'],
      ['label = `', 'label = `'],
    ];
    for (const [needle, original] of pairs) {
      const expected = locate(lf, original);
      expect(trace('template/unicode', needle)).toStrictEqual(expected);
      expect(trace('template/unicode-crlf', needle)).toStrictEqual(expected);
    }
    // Columns count UTF-16 units: the emoji before `label` is two.
    expect(trace('template/unicode', 'label)')).toStrictEqual({ line: 7, column: 22 });
  });
});
