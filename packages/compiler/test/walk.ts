import { globSync, readFileSync } from 'node:fs';
import type { SourceLocation } from '../src/template/ast.ts';

const root = new URL('fixtures/', import.meta.url);

/** Every fixture as `[name, source]`, where the name is `<group>/<case>`. */
export const fixtures: [string, string][] = globSync('*/*/input.vibe', { cwd: root })
  .map((file) => file.replaceAll('\\', '/'))
  .toSorted()
  .map((file) => [file.slice(0, -'/input.vibe'.length), readFileSync(new URL(file, root), 'utf8')]);

/** The URL of a file in the folder of a fixture. */
export const fixtureFile = (name: string, file: string): URL => new URL(`${name}/${file}`, root);

/** Every object inside `value` (an AST, a descriptor), `value` included, in document order. */
export function* objects(value: unknown): Generator<object> {
  if (typeof value !== 'object' || value === null) return;
  yield value;
  for (const child of Object.values(value)) yield* objects(child);
}

/** Every source location inside `value`. */
export const locations = (value: unknown): SourceLocation[] =>
  [...objects(value)].filter(
    (o): o is SourceLocation => 'source' in o && 'start' in o && 'end' in o,
  );
