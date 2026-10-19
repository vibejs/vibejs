import { analyzeScript, parse, resolveComponentTag, type Diagnostic } from '@vibejs-org/compiler';
import { CodeBuilder, Preset, type SpanMapping } from './builder.ts';
import type { Names } from './expression.ts';
import { script, setupBindings } from './script.ts';
import { children, CTX_TYPES, key, type Walk } from './template.ts';

/** A forwarded compiler diagnostic; `code` is the numeric part of VIBE####. */
export interface LanguageDiagnostic {
  code: number;
  message: string;
  start: number;
  length: number;
}

export interface GeneratedFile {
  text: string;
  spans: SpanMapping[];
  diagnostics: LanguageDiagnostic[];
}

const CTX = ['$attrs', '$slots', '$emit', '$props'];
/** Macro calls; comments and strings match first, so a macro named in them is not a call. */
// ponytail: regex scan, misses a call inside a template literal `${}`; use the script AST if needed.
const MACROS =
  /\/\/[^\n]*|\/\*[\s\S]*?\*\/|'(?:\\.|[^'\\\n])*'|"(?:\\.|[^"\\\n])*"|`(?:\\.|[^`\\])*`|\b(define(?:Props|Emits|Slots|Model|Expose|Options))\s*[<(]/g;
const TYPES = '__VibeProps, __VibeEmits, __VibeSlots';

/**
 * The virtual TypeScript of a `.vibe` file and its spans into `text` (UTF-16 offsets). Never throws
 * on user input; `text` is not changed (CRLF passes through).
 */
export function generate(fileName: string, text: string): GeneratedFile {
  const { descriptor, diagnostics } = parse(text, { filename: fileName });
  const analysis = analyzeScript(descriptor);
  const b = new CodeBuilder(text);
  const file = /[^/\\]*$/.exec(fileName)![0];
  const own = file.replace(/\.vibe$/, '');
  const exposed = script(b, descriptor, analysis);

  const setup = setupBindings(analysis);
  const ctx = new Map<string, [number, number] | null>(CTX.map((name) => [name, null]));
  for (const { name, decl } of analysis.propKeys) if (!setup.has(name)) ctx.set(name, decl);
  const names: Names = {
    setup,
    ctx,
    usedSetup: new Set(),
    usedCtx: new Set(),
    unknown: new Map(),
    writes: false,
  };
  const w: Walk = {
    b: new CodeBuilder(text),
    names,
    source: text,
    depth: 1,
    own:
      setup.has(own) || ctx.has(own)
        ? undefined
        : (resolveComponentTag(own, analysis, fileName) ?? undefined),
    ownUsed: false,
    handles: 0,
    outlets: analysis.macros.slots ? undefined : new Map(),
    slots: 0,
    refs: new Map(),
    loops: 0,
  };
  children(descriptor.template?.ast.children ?? [], w, new Set());

  const used = [...names.usedSetup];
  b.add(`const __vibe_setup = { ${used.join(', ')} };\n{`);
  /** `const { a, b } = from;` with spans to the declarations (LINK) or to the first use (NONE). */
  const destructure = (list: [string, [number, number] | null, number][], from: string) => {
    if (list.length === 0) return;
    b.add('\n  const { ');
    list.forEach(([name, at, features], i) => {
      if (i > 0) b.add(', ');
      if (at) b.atom(name, ...at, features);
      else b.add(name);
    });
    b.add(` } = ${from};`);
  };
  destructure(
    used.map((name) => link(name, setup)),
    '__vibe.unrefs(__vibe_setup)',
  );
  if (names.usedCtx.size > 0) b.add(`\n  const __vibe_ctx = __vibe.ctx<${CTX_TYPES}>();`);
  destructure(
    [...names.usedCtx].map((name) => link(name, ctx)),
    '__vibe_ctx',
  );
  // Other names fail at their first use instead of resolving from lib.dom, as they do at runtime.
  destructure(
    [...names.unknown].map(([name, at]) => [name, at, Preset.NONE]),
    '{}',
  );
  if (names.writes) {
    const lets = used.filter((name) => analysis.bindings.get(name)!.kind === 'let');
    const letNames = lets.map((name) => `'${name}'`).join(' | ') || 'never';
    b.add(`\n  const __vibe_w = __vibe.writable<typeof __vibe_setup, ${letNames}>(__vibe_setup);`);
  }
  b.append(w.b).add('\n}\n');

  const refs = [...w.refs].map(([name, type]) => `${key(name)}: ${type}`);
  const models = analysis.macros.models.map(({ name, binding, required }) => {
    const value = `(typeof ${binding})['value']`;
    const modifiers = name === 'modelValue' ? 'modelModifiers' : `${name}Modifiers`;
    return `${key(name)}${required ? '' : '?'}: ${value}; ${key(`onUpdate:${name}`)}?: (value: ${value}) => void; ${key(modifiers)}?: (typeof ${binding})[1]`;
  });
  if (w.outlets) {
    const slots = [...w.outlets].map(
      ([name, ks]) =>
        `${key(name)}?: (props: ${ks.map((k) => `typeof __vibe_s${k}`).join(' | ')}) => unknown`,
    );
    b.add(`type __VibeSlots = ${members(slots)};\n`);
  }
  b.add(`type __VibeExposed = ${exposed ? 'typeof __vibe_exposed' : '{}'};\n`);
  b.add(`type __VibeRefs = ${members(refs)};\ntype __VibeModels = ${members(models)};\n`);
  b.atom(
    `export default __vibe.defineComponent<${TYPES}, __VibeExposed, __VibeModels>();`,
    0,
    0,
    Preset.ANCHOR,
  );
  b.add("\nimport * as __vibe from '@vibejs-org/ui/tooling';\n");
  if (w.ownUsed) b.add(`import __vibe_self from ${JSON.stringify(`./${file}`)};\n`);
  const content = descriptor.scriptSetup?.content ?? '';
  const macros = new Set([...content.matchAll(MACROS)].map((m) => m[1]).filter(Boolean));
  if (macros.size > 0)
    b.add(`import { ${[...macros].join(', ')} } from '@vibejs-org/ui/tooling';\n`);

  return {
    text: b.text,
    spans: b.spans,
    diagnostics: diagnostics.filter(forwarded).map(toLanguage),
  };
}

/** A destructured name with a LINK span to its declaration. */
const link = (name: string, decls: ReadonlyMap<string, [number, number] | null>) =>
  [name, decls.get(name)!, Preset.LINK] as [string, [number, number] | null, number];

/** An object type literal. */
const members = (list: string[]) => (list.length > 0 ? `{ ${list.join('; ')} }` : '{}');

/** Only SFC-structure and HTML parse errors: tsc skips type checking after a mapper diagnostic. */
const forwarded = (d: Diagnostic) => {
  const code = Number(d.code.slice(4));
  return code >= 1000 && code < 1200 && !d.typeChecked;
};

const toLanguage = (d: Diagnostic): LanguageDiagnostic => ({
  code: Number(d.code.slice(4)),
  message: [d.message, ...d.fixes, d.docs].join(' '),
  start: d.start.offset,
  length: d.end.offset - d.start.offset,
});
