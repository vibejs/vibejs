import { globSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const here = (path: string) => fileURLToPath(new URL(path, import.meta.url));

/** `[name, source]` of every file matching `pattern` under `dir`, sorted; the name is the path. */
function read(dir: string, pattern: string): [string, string][] {
  return globSync(pattern, { cwd: dir })
    .map((file) => file.replaceAll('\\', '/'))
    .toSorted()
    .map((file) => [file, readFileSync(`${dir}/${file}`, 'utf8')]);
}

export const CODEGEN: string = here('fixtures/codegen');
const TYPECHECK = here('fixtures/typecheck');

/** The codegen inputs, as `<feature>/<case>/<name>.vibe`: `input.vibe`, or a component name. */
export const codegen: [string, string][] = read(CODEGEN, '*/*/*.vibe');
/** The `.vibe` files of the typecheck corpus and demo. */
export const typecheck: [string, string][] = read(TYPECHECK, '**/*.vibe');
/** The compiler's fixture inputs. */
export const compiler: [string, string][] = read(
  here('../../compiler/test/fixtures'),
  '*/*/input.vibe',
);
