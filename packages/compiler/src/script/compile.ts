import { MagicString } from 'magic-string';
import type { SFCDescriptor } from '../sfc/parse.ts';
import type { InternalAnalysis } from './analyze.ts';

export interface ScriptOutput {
  /** Over the whole `.vibe` source; the text outside the script is removed. */
  s: MagicString;
  /** Runtime helpers the script uses, imported from `@vibejs-org/ui/internal` with a `_` prefix. */
  abiImports: Set<string>;
  /** camelCase keys as written. */
  propKeys: string[];
  /** Event names, `update:<model>` included. */
  emits: string[];
  /** Module-scope object source of the default thunks, as in `{ b: () => 1 }`. */
  defaults: string | null;
  options: { name?: string; inheritAttrs?: boolean };
  /** False without `<script setup>`. */
  hasSetup: boolean;
}

const IDENTIFIER = /^[A-Za-z_$][\w$]*$/;
const SIMPLE = /^(?:[\w$.]+|'[^'\\\n]*'|"[^"\\\n]*")$/;

/**
 * Rewrites `<script setup>` into a `_setup(__props, __ctx)` function with the imports and type
 * exports hoisted above it, plus the component metadata. Takes the analysis of the same descriptor.
 */
export function compileScript(d: SFCDescriptor, a: InternalAnalysis): ScriptOutput {
  const { source, scriptSetup: block } = d;
  const s = new MagicString(source);
  const models = new Set(a.macros.models.map((m) => m.name));
  const out: ScriptOutput = {
    s,
    abiImports: new Set(models.size > 0 ? ['useModel'] : []),
    propKeys: a.propKeys.map((key) => key.name),
    emits: a.emits,
    defaults: null,
    options: a.options,
    hasSetup: block !== null,
  };
  if (!block) {
    s.remove(0, source.length);
    return out;
  }
  const start = block.loc.start.offset;
  const end = block.loc.end.offset;
  s.remove(0, start);
  s.remove(end, source.length);
  if (!a.program) s.remove(start, end);

  for (const [from, to] of a.hoisted) {
    s.move(from, to, 0);
    s.appendLeft(to, '\n');
  }
  for (const edit of a.edits) {
    if (edit.text) s.overwrite(edit.start, edit.end, edit.text);
    else s.remove(edit.start, edit.end);
  }

  const entries = [...a.defaults].map(([key, [from, to]]) => {
    const value = source.slice(from, to);
    // A model default is already a thunk. Other values keep their meaning in parentheses, which a
    // name, a number or a plain string does not need.
    const thunk = models.has(key)
      ? value
      : SIMPLE.test(value)
        ? `() => ${value}`
        : `() => (${value})`;
    return `${IDENTIFIER.test(key) ? key : JSON.stringify(key)}: ${thunk}`;
  });
  out.defaults = entries.length > 0 ? `{ ${entries.join(', ')} }` : null;

  const returned = [...a.bindings].flatMap(([name, { kind }]) => {
    if (kind === 'let') {
      const v = name === 'v' ? '_v' : 'v';
      return [`get ${name}() { return ${name} }`, `set ${name}(${v}) { ${name} = ${v} }`];
    }
    return kind === 'const' || kind === 'maybe-ref' ? [name] : [];
  });
  const defaults = out.defaults ? `const _defaults = ${out.defaults}\n` : '';
  s.appendLeft(start, `${defaults}function _setup(__props: any, __ctx: any) {\n`);
  s.append(`\nreturn { ${returned.join(', ')} }\n}\n`);
  return out;
}
