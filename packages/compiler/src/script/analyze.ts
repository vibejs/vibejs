import type { VibeError } from '@vibejs-org/errors';
import { parseSync, visitorKeys } from 'oxc-parser';
import { LineIndex, type Diagnostic } from '../diagnostics.ts';
import { vibeError } from '../errors.gen.ts';
import { RAW_TRANSFER, report, type ExprContext } from '../expr/parse.ts';
import type { ExprScope } from '../expr/rewrite.ts';
import {
  children,
  FUNCTIONS,
  isIdentifier,
  patternIds,
  walk,
  type Identifier,
  type Node,
} from '../expr/walk.ts';
import type { SFCDescriptor } from '../sfc/parse.ts';
import { emitKeys, first, keyName, propKeys, str, type Key } from './keys.ts';

/** The binding kinds of `analyzeScript` (C5). */
export type BindingKind = 'prop' | 'prop-alias' | 'const' | 'maybe-ref' | 'let' | 'import';

/** The `<script setup>` facts that language tools read (C5). Offsets are file-relative UTF-16. */
export interface ScriptAnalysis {
  bindings: Map<string, { kind: BindingKind; decl: [number, number] }>;
  propKeys: { name: string; decl: [number, number] }[];
  macros: {
    props?: { typeArg: [number, number] };
    emits?: { typeArg: [number, number] };
    slots?: { typeArg: [number, number] };
    models: { name: string; binding: string; required: boolean }[];
    expose?: { callStart: number };
  };
  templateRefs: { key: string; keyLoc: [number, number]; typeArgInsertAt: number | null }[];
  importRanges: [number, number][];
  diagnostics: Diagnostic[];
}

/** A replacement of the file range [start, end); an empty text removes it. */
interface Edit {
  start: number;
  end: number;
  text: string;
}

/** The analysis plus what only the compiler needs. */
export interface InternalAnalysis extends ScriptAnalysis {
  /** alias -> prop key */
  propAliases: Map<string, string>;
  /** Event names, `update:<model>` included. */
  emits: string[];
  /** prop key -> the file range of its default: a value for a prop, a thunk for a model. */
  defaults: Map<string, [number, number]>;
  options: { name?: string; inheritAttrs?: boolean };
  /** The parsed script, with file offsets; null without a script or after a syntax error. */
  program: Node | null;
  scope: ExprScope;
  /** The file ranges of the imports and type exports that move to module scope, in order. */
  hoisted: [number, number][];
  /** Macro rewrites and destructured prop references, without overlaps. */
  edits: Edit[];
}

const MACROS = new Set([
  'defineProps',
  'defineEmits',
  'defineSlots',
  'defineModel',
  'defineExpose',
  'defineOptions',
]);
/** The runtime ABI exports (C3), which compiled code imports with a `_` prefix. */
const ABI =
  'template child next nthChild txt renderEffect setText setAttr setProp setClass setStyle setHtml setDynamicProps toDisplayString on withModifiers withKeys insert createIf createKeyed createFor createComponent createDynamicComponent createSlot applyVShow applyTextModel applyCheckboxModel applyRadioModel applySelectModel useModel setRef hmr';
const GENERATED = new Set([
  ...'__props __ctx _setup _defaults _sfc $setup $props $ctx'.split(' '),
  ...ABI.split(' ').map((name) => `_${name}`),
]);
const REACTIVE = new Set(['reactive', 'readonly', 'shallowReactive']);
/** Calls that read a destructured prop once when it is passed directly (VIBE3107). */
const BY_VALUE = new Set<string | undefined>(['watch', 'toRef']);
const THUNKS = new Set(['ArrowFunctionExpression', 'FunctionExpression']);
/** Type-only wrappers around an expression. */
const TS_WRAPPERS = new Set([
  'TSAsExpression',
  'TSSatisfiesExpression',
  'TSNonNullExpression',
  'TSTypeAssertion',
]);

const range = (node: Node): [number, number] => [node.start, node.end];
/** A read of a prop key on `__props`. */
const read = (key: string) =>
  /^[A-Za-z_$][\w$]*$/.test(key) ? `__props.${key}` : `__props[${JSON.stringify(key)}]`;
const isCall = (node: Node | undefined, names: ReadonlySet<string>): node is Node =>
  node?.type === 'CallExpression' && names.has(str(first(node, 'callee')) ?? '');
/** The value of a string literal. */
const literal = (node: Node | undefined) =>
  node?.type === 'Literal' ? str(node, 'value') : undefined;
const isBoolean = (node: Node | undefined) =>
  node?.type === 'Literal' && typeof node.value === 'boolean';

function empty(): InternalAnalysis {
  return {
    bindings: new Map(),
    propKeys: [],
    macros: { models: [] },
    templateRefs: [],
    importRanges: [],
    diagnostics: [],
    propAliases: new Map(),
    emits: [],
    defaults: new Map(),
    options: {},
    program: null,
    scope: { bindings: new Map(), propAliases: new Map(), locals: [] },
    hoisted: [],
    edits: [],
  };
}

/** Analyzes `<script setup>` for the compiler. Never throws; problems become diagnostics. */
export function analyze(d: SFCDescriptor): InternalAnalysis {
  const a = empty();
  const block = d.scriptSetup;
  if (!block) return a;
  const ctx: ExprContext = {
    file: d.filename,
    lines: new LineIndex(d.source),
    diagnostics: a.diagnostics,
  };
  const at = (error: VibeError, [start, end]: [number, number]) => report(ctx, error, start, end);
  const base = block.loc.start.offset;
  // Spaces in front of the content make every span a file offset.
  const { program, errors } = parseSync('script.ts', ' '.repeat(base) + block.content, {
    lang: 'ts',
    sourceType: 'module',
    preserveParens: false,
    ...RAW_TRANSFER,
  });
  if (errors.length > 0) {
    const end = base + block.content.length;
    const clamp = (offset: number) => Math.min(Math.max(offset, base), end);
    const label = Object.assign({ start: base, end }, errors[0].labels[0]);
    at(vibeError('VIBE3003', { reason: errors[0].message }), [
      clamp(label.start),
      clamp(label.end),
    ]);
    return a;
  }
  const root: Node = { ...program };
  a.program = root;
  const body = children(root, 'body');
  const { bindings, propAliases, defaults, edits, macros } = a;
  const text = (node: Node) => d.source.slice(node.start, node.end);

  // Type declarations first: a macro may use a type declared below it.
  const decls = new Map<string, Node[]>();
  for (const statement of body) {
    const decl = statement.type.startsWith('Export') ? first(statement, 'declaration') : statement;
    if (decl?.type === 'TSInterfaceDeclaration' || decl?.type === 'TSTypeAliasDeclaration') {
      const name = str(first(decl, 'id'))!;
      decls.set(name, [...(decls.get(name) ?? []), decl]);
    }
  }

  const bind = (id: Identifier, kind: BindingKind) => {
    if (MACROS.has(id.name)) at(vibeError('VIBE3008', { macro: id.name }), range(id));
    if (GENERATED.has(id.name)) at(vibeError('VIBE3007', { name: id.name }), range(id));
    if (!bindings.has(id.name)) bindings.set(id.name, { kind, decl: range(id) });
  };

  // Calls of the macros where they may stand, with their declarator.
  const placed = new Map<Node, { statement: Node; declarator?: Node; kind?: string }>();
  for (const statement of body) {
    if (statement.type === 'ExpressionStatement') {
      const call = first(statement, 'expression');
      if (isCall(call, MACROS)) placed.set(call, { statement });
    } else if (statement.type === 'VariableDeclaration') {
      const declarators = children(statement, 'declarations');
      const call = first(declarators[0], 'init');
      if (declarators.length === 1 && isCall(call, MACROS)) {
        placed.set(call, { statement, declarator: declarators[0], kind: str(statement, 'kind') });
      }
    }
  }

  // Module syntax, value bindings and the statements that move or disappear.
  const imported = new Set<string>();
  const skipped = new Set<Node>();
  for (const statement of body) {
    const { type } = statement;
    if (type === 'ImportDeclaration') {
      a.importRanges.push(range(statement));
      a.hoisted.push(range(statement));
      skipped.add(statement);
      if (statement.importKind === 'type') continue;
      const source = str(first(statement, 'source'), 'value');
      for (const specifier of children(statement, 'specifiers')) {
        if (specifier.importKind === 'type') continue;
        const [local] = children(specifier, 'local').filter(isIdentifier);
        const name = str(first(specifier, 'imported'));
        if (name !== undefined && MACROS.has(name) && name !== local.name) {
          at(vibeError('VIBE3008', { macro: name }), range(specifier));
        }
        bind(local, 'import');
        if (source === '@vibejs-org/ui' && BY_VALUE.has(name)) imported.add(local.name);
      }
    } else if (type.startsWith('Export') || type === 'TSExportAssignment') {
      const decl = first(statement, 'declaration');
      const specifiers = children(statement, 'specifiers');
      const typeOnly =
        statement.exportKind === 'type' ||
        decl?.type === 'TSInterfaceDeclaration' ||
        decl?.type === 'TSTypeAliasDeclaration' ||
        (specifiers.length > 0 && specifiers.every((s) => s.exportKind === 'type'));
      if (typeOnly) {
        a.hoisted.push(range(statement));
        skipped.add(statement);
      } else at(vibeError('VIBE3001'), [statement.start, statement.start + 'export'.length]);
    } else if (statement.declare === true) {
      continue;
    } else if (type === 'TSModuleDeclaration' || type === 'TSImportEqualsDeclaration') {
      const syntax = type === 'TSModuleDeclaration' ? 'namespace' : 'import =';
      at(vibeError('VIBE3010', { syntax }), [statement.start, first(statement, 'id')!.end]);
    } else if (
      type === 'FunctionDeclaration' ||
      type === 'ClassDeclaration' ||
      type === 'TSEnumDeclaration'
    ) {
      for (const id of children(statement, 'id').filter(isIdentifier)) bind(id, 'const');
    } else if (type === 'VariableDeclaration') {
      for (const declarator of children(statement, 'declarations')) {
        let init = first(declarator, 'init');
        if (init && placed.has(init)) continue;
        while (init && TS_WRAPPERS.has(init.type)) init = first(init, 'expression');
        const id = first(declarator, 'id')!;
        const kind: BindingKind =
          statement.kind === 'let' || statement.kind === 'var'
            ? 'let'
            : id.type !== 'Identifier' ||
                (init?.type === 'CallExpression' && !REACTIVE.has(str(first(init, 'callee')) ?? ''))
              ? 'maybe-ref'
              : 'const';
        for (const name of patternIds(id)) bind(name, kind);
      }
    }
  }

  // Everything else that reads the whole tree: misplaced macros, `await`, template refs.
  const byValue = new Map<Node, string>();
  const wrapped = new Set<Node>();
  /** `fns` is the number of functions around `n`. */
  /** A call by the name of its callee. */
  const scanCall = (n: Node, callee: Node, name: string) => {
    const args = children(n, 'arguments');
    if (name === 'withDefaults') {
      at(vibeError('VIBE3006'), range(callee));
      // A macro inside is reported by VIBE3006 alone.
      for (const arg of args) wrapped.add(arg);
    }
    if (MACROS.has(name) && !placed.has(n) && !wrapped.has(n)) {
      at(vibeError('VIBE3004', { macro: name }), range(callee));
    }
    const refKey = literal(args[0]);
    if (name === 'useTemplateRef' && refKey !== undefined) {
      a.templateRefs.push({
        key: refKey,
        keyLoc: range(args[0]),
        typeArgInsertAt: first(n, 'typeArguments') ? null : callee.end,
      });
    }
    if (imported.has(name) && args[0]?.type === 'Identifier') byValue.set(args[0], name);
  };
  const scan = (n: Node, fns: number): void => {
    const callee = n.type === 'CallExpression' ? first(n, 'callee')! : undefined;
    const name = str(callee);
    if (name !== undefined) scanCall(n, callee!, name);
    const awaited = n.type === 'AwaitExpression' || n.await === true || n.kind === 'await using';
    if (awaited && fns === 0) {
      const start = d.source.indexOf('await', n.start);
      at(vibeError('VIBE3002'), [start, start + 'await'.length]);
    }
    const inner = FUNCTIONS.has(n.type) ? fns + 1 : fns;
    // Index loops, as in `varIds` (expr/walk.ts): a `for…of` here allocates per step.
    const keys = visitorKeys[n.type];
    for (let k = 0; k < keys.length; k++) {
      const list = children(n, keys[k]);
      for (let i = 0; i < list.length; i++) scan(list[i], inner);
    }
  };
  for (const statement of body) scan(statement, 0);

  // The macros, in source order.
  const seen = new Set<string>();
  const defineKeys: Key[] = [];
  const destructured = new Map<string, string>();
  const modelDecls: [string, [number, number]][] = [];
  const defaultNodes: [string, Node][] = [];
  for (const [call, { statement, declarator, kind }] of placed) {
    const [callee] = children(call, 'callee').filter(isIdentifier);
    const macro = callee.name;
    const args = children(call, 'arguments');
    const typeArguments = first(call, 'typeArguments');
    const typeParams = typeArguments ? children(typeArguments, 'params') : [];
    const typeArg: [number, number] | undefined =
      typeParams.length > 0 ? [typeParams[0].start, typeParams.at(-1)!.end] : undefined;
    const id = declarator && first(declarator, 'id')!;
    if (macro !== 'defineModel' && seen.has(macro)) {
      at(vibeError('VIBE3005', { macro }), range(callee));
      continue;
    }
    seen.add(macro);
    if (macro === 'defineModel') {
      model(call, statement, id, kind);
      continue;
    }
    if (kind !== undefined && kind !== 'const') {
      at(vibeError('VIBE3004', { macro }), range(callee));
      continue;
    }
    skipped.add(statement);
    const replace = (replacement: string) => {
      if (id) edits.push({ start: call.start, end: call.end, text: replacement });
      else edits.push({ start: statement.start, end: statement.end, text: '' });
      if (id) for (const name of patternIds(id)) bind(name, 'const');
    };
    if (macro === 'defineProps' || macro === 'defineEmits' || macro === 'defineSlots') {
      const code = {
        defineProps: 'VIBE3101',
        defineEmits: 'VIBE3201',
        defineSlots: 'VIBE3311',
      } as const;
      if (args.length > 0) at(vibeError(code[macro]), [args[0].start, args.at(-1)!.end]);
      if (!typeArg) at(vibeError('VIBE3102', { macro }), range(callee));
    }
    if (macro === 'defineProps') {
      if (typeArg) macros.props = { typeArg };
      const resolved = typeArg && propKeys(typeParams[0], decls);
      if (id?.type === 'ObjectPattern') {
        edits.push({ start: statement.start, end: statement.end, text: '' });
        destructure(id);
      } else {
        if (id && id.type !== 'Identifier') at(vibeError('VIBE3108'), range(id));
        else replace('__props');
        if (typeArg && !resolved) at(vibeError('VIBE3103'), typeArg);
      }
      defineKeys.unshift(...(resolved ?? []));
    } else if (macro === 'defineEmits') {
      replace('__ctx.emit');
      if (!typeArg) continue;
      macros.emits = { typeArg };
      const result = emitKeys(typeParams[0], decls);
      if ('keys' in result) a.emits.push(...result.keys);
      else if ('invalid' in result) at(vibeError('VIBE3202'), range(result.invalid));
      else at(vibeError('VIBE3203', { type: text(typeParams[0]) }), typeArg);
    } else if (macro === 'defineSlots') {
      replace('__ctx.slots');
      if (typeArg) macros.slots = { typeArg };
    } else if (macro === 'defineExpose') {
      macros.expose = { callStart: call.start };
      edits.push({ start: callee.start, end: callee.end, text: '__ctx.expose' });
      if (id) for (const name of patternIds(id)) bind(name, 'const');
      // Its argument keeps its prop references.
      skipped.delete(statement);
    } else {
      options(callee, args);
      replace('undefined');
    }
  }

  function destructure(pattern: Node): void {
    for (const property of children(pattern, 'properties')) {
      if (property.type === 'RestElement') {
        const arg = first(property, 'argument')!;
        at(vibeError('VIBE3104', { name: text(arg) }), range(property));
        continue;
      }
      const value = first(property, 'value')!;
      const local = value.type === 'AssignmentPattern' ? first(value, 'left')! : value;
      const key = keyName(property);
      if (key === undefined || !isIdentifier(local)) {
        at(vibeError('VIBE3108'), range(property));
        continue;
      }
      const { name } = local;
      defineKeys.push({ name: key, decl: range(first(property, 'key')!) });
      // A prop key of the same name is checked with the other prop keys below.
      if (name !== key && bindings.has(name)) {
        at(vibeError('VIBE3009', { name }), range(local));
        continue;
      }
      destructured.set(name, key);
      if (name !== key) propAliases.set(name, key);
      bind(local, name === key ? 'prop' : 'prop-alias');
      if (value.type === 'AssignmentPattern') {
        const fallback = first(value, 'right')!;
        defaults.set(key, range(fallback));
        defaultNodes.push([key, fallback]);
      }
    }
  }

  function model(call: Node, statement: Node, id: Node | undefined, kind?: string): void {
    const callee = first(call, 'callee')!;
    const args = children(call, 'arguments');
    const named = literal(args[0]);
    const rest = named === undefined ? args : args.slice(1);
    const opts = rest.at(0);
    const extra = rest.slice(1);
    const elements = id?.type === 'ArrayPattern' ? children(id, 'elements') : id ? [id] : [];
    const ids = elements.filter(isIdentifier);
    const fail = (reason: string, node: Node) => {
      at(vibeError('VIBE3321', { reason }), range(node));
    };
    const assigned = ids.length > 0 && ids.length <= 2 && ids.length === elements.length;
    if (kind !== 'const' || !assigned) {
      return fail(
        'its result is not assigned to a `const` name or a `[model, modifiers]` pair',
        callee,
      );
    }
    if (named === undefined && opts !== undefined && opts.type !== 'ObjectExpression') {
      return fail('the model name is not a string literal', opts);
    }
    if (extra.length > 0) return fail('it has more than a name and an options object', extra[0]);
    if (opts !== undefined && opts.type !== 'ObjectExpression') {
      return fail('the options are not an object literal', opts);
    }
    let required = false;
    let fallback: Node | undefined;
    for (const property of opts ? children(opts, 'properties') : []) {
      const name = property.type === 'Property' && !property.method ? keyName(property) : undefined;
      const value = first(property, 'value');
      if (name === 'required' && isBoolean(value)) required = value!.value === true;
      else if (name === 'default' && THUNKS.has(value!.type)) fallback = value;
      else {
        return fail(
          'the options hold more than a boolean `required` and a `default` function',
          property,
        );
      }
    }
    const name = named ?? 'modelValue';
    const decl = range(named === undefined ? callee : args[0]);
    if (macros.models.some((m) => m.name === name)) {
      at(vibeError('VIBE3322', { name }), decl);
      return;
    }
    skipped.add(statement);
    macros.models.push({ name, binding: ids[0].name, required });
    modelDecls.push([name, decl]);
    for (const n of ids) bind(n, 'maybe-ref');
    if (fallback) {
      defaults.set(name, range(fallback));
      defaultNodes.push([name, fallback]);
    }
    edits.push({
      start: call.start,
      end: call.end,
      text: `_useModel(__props, ${JSON.stringify(name)})`,
    });
  }

  function options(callee: Node, args: readonly Node[]): void {
    const [arg] = args;
    const valid =
      args.length === 1 &&
      arg.type === 'ObjectExpression' &&
      children(arg, 'properties').every((property) => {
        const name =
          property.type === 'Property' && !property.method ? keyName(property) : undefined;
        const value = first(property, 'value');
        const string = literal(value);
        if (name === 'name' && string !== undefined) a.options.name = string;
        else if (name === 'inheritAttrs' && isBoolean(value))
          a.options.inheritAttrs = value!.value === true;
        else return false;
        return true;
      });
    if (!valid) {
      a.options = {};
      at(
        vibeError('VIBE3331'),
        args.length > 0 ? [args[0].start, args.at(-1)!.end] : range(callee),
      );
    }
  }

  // Prop keys: from the type, then from the destructure, then from the models.
  const keys = new Map<string, Key>();
  for (const key of defineKeys) if (!keys.has(key.name)) keys.set(key.name, key);
  for (const [name, decl] of modelDecls) {
    if (keys.has(name)) at(vibeError('VIBE3322', { name }), decl);
    const modifiers = `${name}Modifiers`;
    if (keys.has(modifiers)) at(vibeError('VIBE3322', { name: modifiers }), decl);
  }
  for (const [name, binding] of bindings) {
    // An alias never has its own key as name, so a prop key under it names another prop.
    if (keys.has(name) && binding.kind !== 'prop') {
      at(vibeError('VIBE3009', { name }), binding.decl);
    }
  }
  const taken = new Set(destructured.values());
  for (const key of keys.values()) {
    if (!bindings.has(key.name) && !taken.has(key.name)) {
      bindings.set(key.name, { kind: 'prop', decl: key.decl });
    }
  }
  for (const [name, decl] of modelDecls) {
    keys.set(name, { name, decl });
    keys.set(`${name}Modifiers`, { name: `${name}Modifiers`, decl });
    if (!a.emits.includes(`update:${name}`)) a.emits.push(`update:${name}`);
  }
  a.propKeys = [...keys.values()];

  // Defaults live at module scope, where only imports and globals exist.
  for (const [prop, node] of defaultNodes) {
    walk(node, {
      ref(id, { local }) {
        const kind = bindings.get(id.name)?.kind;
        if (!local && kind !== undefined && kind !== 'import') {
          at(vibeError('VIBE3105', { prop, name: id.name }), range(id));
        }
      },
    });
  }

  // References to destructured props become `__props` reads.
  for (const statement of body) {
    if (skipped.has(statement)) continue;
    walk(statement, {
      ref(id, { local, writeRoot }, shorthand) {
        const key = destructured.get(id.name);
        if (local || key === undefined) return;
        if (writeRoot) at(vibeError('VIBE3106', { name: id.name }), range(id));
        const fn = byValue.get(id);
        if (fn !== undefined) at(vibeError('VIBE3107', { name: id.name, fn }), range(id));
        const value = read(key);
        edits.push({
          start: id.start,
          end: id.end,
          text: shorthand ? `${id.name}: ${value}` : value,
        });
      },
    });
  }

  // Source order: macro results were added after the other bindings.
  a.bindings = new Map([...bindings].toSorted(([, x], [, y]) => x.decl[0] - y.decl[0]));
  a.scope = {
    bindings: new Map([...a.bindings].map(([name, b]) => [name, b.kind])),
    propAliases,
    locals: [],
  };
  a.diagnostics.sort((x, y) => x.start.offset - y.start.offset);
  return a;
}

/** The bindings, prop keys, macros, template refs and imports of `<script setup>` (C5). */
export function analyzeScript(d: SFCDescriptor): ScriptAnalysis {
  const a = analyze(d);
  return {
    bindings: a.bindings,
    propKeys: a.propKeys,
    macros: a.macros,
    templateRefs: a.templateRefs,
    importRanges: a.importRanges,
    diagnostics: a.diagnostics,
  };
}
