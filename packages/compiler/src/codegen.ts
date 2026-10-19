import { addSegment, type GenMapping } from '@jridgewell/gen-mapping';
import { LineIndex } from './diagnostics.ts';
import type { ExprIR, ExprPart, LocalScope } from './expr/rewrite.ts';
import type {
  ArgIR,
  BlockIR,
  CallIR,
  HandlerIR,
  MakeIR,
  Op,
  PropIR,
  RootIR,
  SlotIR,
  SpreadIR,
  Step,
} from './transform/ir.ts';

/** Generated code: strings are generated text, objects user text mapped to its file offset. */
type Code = ExprPart[];

const IDENTIFIER = /^[A-Za-z_$][\w$]*$/;
/** An object key as written: a name, else a string literal. */
const key = (k: string): string => (IDENTIFIER.test(k) ? k : JSON.stringify(k));
const text = (code: Code): string => code.map((p) => (typeof p === 'string' ? p : p.code)).join('');
/** A literal of the IR (`value` arguments): strings, booleans, string lists and flat objects. */
const literal = (v: unknown): string =>
  Array.isArray(v)
    ? `[${v.map(literal).join(', ')}]`
    : typeof v === 'object' && v !== null
      ? `{ ${Object.entries(v)
          .map(([k, x]) => `${key(k)}: ${literal(x)}`)
          .join(', ')} }`
      : JSON.stringify(v);
/**
 * `code` in parentheses where it would not stay one expression: an object literal as an arrow
 * body, a sequence as an argument, or a leading line break after `return`.
 */
const paren = (code: Code): Code => (/^\s*[{\n]|,/.test(text(code)) ? ['(', ...code, ')'] : code);
/** Joins code lists with `sep`. */
const list = (items: Code[], sep = ', '): Code => items.flatMap((c, i) => (i ? [sep, ...c] : c));

/** The template scopes a prop value reads; a handler reads its own in its prelude. */
const scopesOf = (p: PropIR): LocalScope[] =>
  typeof p.value === 'object' && !('mods' in p.value) ? [...p.value.scopes] : [];

/** A mapping to the node at file offset `loc`. */
const node = (loc: number | undefined): Code =>
  loc === undefined ? [] : [{ code: '', offset: loc }];

function walk(from: string, step: Step): string {
  return typeof step === 'number' ? `_nthChild(${from}, ${step})` : `_${step}(${from})`;
}

/**
 * Generates the hoisted templates and the `_render` function of `ir`, starting at the 0-based
 * output `line`. Every mapped part of an expression and every node with a source offset adds one
 * segment to `map`, against the single source `filename`.
 */
export function generate(
  ir: RootIR,
  o: { filename: string; source: string; dev: boolean },
  map: GenMapping,
  line: number,
): string {
  const lines = new LineIndex(o.source);
  /** The prelude statements of each v-for and v-slot scope, outer scopes first. */
  const preludes = new Map<LocalScope, Code[]>();
  let fors = 0;
  let slots = 0;

  /** The statements that declare the template locals `scopes` reference, outer to inner. */
  const prelude = (scopes: Set<LocalScope>, skip?: LocalScope): Code =>
    [...preludes]
      .filter(([scope]) => scope !== skip && scopes.has(scope))
      .flatMap(([, statements]) => statements.flatMap((s) => [...s, '; ']));

  /** A closure that evaluates `body` after the prelude of `scopes`. */
  const closure = (params: string, scopes: Set<LocalScope>, body: Code): Code => {
    const pre = prelude(scopes);
    return pre.length > 0
      ? [`${params} => { `, ...pre, 'return ', ...paren(body), ' }']
      : [`${params} => `, ...paren(body)];
  };
  const getter = (e: ExprIR): Code => closure('()', e.scopes, e.parts);

  function handler(h: HandlerIR): Code {
    const { kind, parts, scopes } = h.expr;
    const pre = prelude(scopes);
    let code: Code;
    if (kind === 'statements' || kind === 'expression') {
      code = ['($event) => { ', ...pre, ...parts, ' }'];
    } else {
      const fn = kind === 'path' ? parts : ['(', ...parts, ')'];
      if (pre.length > 0) code = ['(...args) => { ', ...pre, 'return ', ...fn, '(...args) }'];
      else code = kind === 'path' ? ['(...args) => ', ...fn, '(...args)'] : parts;
    }
    if (h.mods.length > 0) code = ['_withModifiers(', ...code, `, ${literal(h.mods)})`];
    if (h.keys.length > 0) code = ['_withKeys(', ...code, `, ${literal(h.keys)})`];
    return code;
  }

  function arg(a: ArgIR): Code {
    if ('ref' in a) return [`_n${a.ref}`];
    if ('expr' in a) return paren(a.expr.parts);
    if ('getter' in a) return getter(a.getter);
    if ('handler' in a) return handler(a.handler);
    if ('value' in a) return [literal(a.value)];
    const entries = Object.entries(a.object).map(([k, v]) => [`${key(k)}: `, ...arg(v)]);
    return ['{ ', ...list(entries), ' }'];
  }

  /** A call; `on` takes the listener options of its handler. */
  function call(c: CallIR): Code {
    const args = c.args.map(arg);
    const last = c.args.at(-1)!;
    if (c.fn === 'on' && 'handler' in last && Object.keys(last.handler.options).length > 0) {
      args.push([literal(last.handler.options)]);
    }
    return [`_${c.fn}(`, ...list(args), ')'];
  }

  /** `{ ops; return refs }`, indented one level below `ind`. */
  function block(b: BlockIR, ind: string): Code {
    const inner = `${ind}  `;
    const refs = b.returns.map((r) => `_n${r}`);
    const ret = refs.length === 1 ? refs[0] : `[${refs.join(', ')}]`;
    return [
      '{',
      ...b.ops.flatMap((op) => [`\n${inner}`, ...emit(op, inner)]),
      `\n${inner}return ${ret}\n${ind}}`,
    ];
  }

  function emit(op: Op, ind: string): Code {
    if (op.op === 'tpl') return [`const _n${op.id} = `, ...node(op.loc), `_t${op.tpl}()`];
    if (op.op === 'walk') {
      return [`const _n${op.id} = `, ...node(op.loc), op.steps.reduce(walk, `_n${op.from}`)];
    }
    if (op.op === 'effect') {
      const scopes = op.call.args.flatMap((a) => ('expr' in a ? [...a.expr.scopes] : []));
      const pre = prelude(new Set(scopes));
      const body = call(op.call);
      const fn = pre.length > 0 ? ['() => { ', ...pre, ...body, ' }'] : ['() => ', ...body];
      let loc = '';
      if (o.dev) {
        const { line: l, column } = lines.position(op.loc);
        loc = `, ${JSON.stringify(`${o.filename}:${l}:${column}`)}`;
      }
      return ['_renderEffect(', ...fn, `${loc})`];
    }
    if (op.op === 'once') return call(op.call);
    if (op.op === 'insert') return [`_insert(_n${op.id}, _n${op.parent}, _n${op.anchor})`];
    const out: Code = [`const _n${op.id} = `, ...make(op.make, ind)];
    if (op.parent !== null) out.push(`\n${ind}_insert(_n${op.id}, _n${op.parent}, _n${op.anchor})`);
    return out;
  }

  const value = (p: PropIR): Code => {
    const v = p.value;
    if (v === true) return ['true'];
    if (typeof v === 'string') return [JSON.stringify(v)];
    return 'mods' in v ? handler(v) : paren(v.parts);
  };

  /** Component or slot props: getters, or `{ $: [...] }` with a spread. */
  function props(own: PropIR[], spread: SpreadIR | null, ind: string): Code | null {
    if (spread) {
      const groups = spread.map((g): Code => {
        if (!Array.isArray(g)) return closure('()', g.scopes, g.parts);
        const entries = g.map((p) => [`${key(p.key)}: `, ...value(p)]);
        return closure('()', new Set(g.flatMap(scopesOf)), ['{ ', ...list(entries), ' }']);
      });
      return ['{ $: [', ...list(groups), '] }'];
    }
    if (own.length === 0) return null;
    const entries = own.map((p): Code => {
      const v = p.value;
      const body = typeof v === 'object' && !('mods' in v) ? getter(v) : ['() => ', ...value(p)];
      return [`\n${ind}  ${key(p.key)}: `, ...body, ','];
    });
    return ['{', ...entries.flat(), `\n${ind}}`];
  }

  function slotFn(slot: SlotIR, ind: string): Code {
    let params = '()';
    if (slot.scope) {
      const name = `_slot${slots++}`;
      preludes.set(slot.scope, [['const ', slot.params!, ` = ${name}`]]);
      params = `(${name})`;
    }
    return [`${params} => `, ...block(slot.block, ind)];
  }

  function slotsOf(all: SlotIR[], ind: string): Code | null {
    if (all.length === 0) return null;
    const inner = `${ind}  `;
    const fixed = all.filter((s) => !s.test);
    const conditional = all.filter((s) => s.test);
    const out: Code = ['{'];
    for (const slot of fixed)
      out.push(`\n${inner}${key(slot.name)}: `, ...slotFn(slot, inner), ',');
    if (conditional.length > 0) {
      out.push(`\n${inner}$: [`);
      for (const slot of conditional) {
        const test = slot.test!;
        const entry: Code = [
          ...paren(test.parts),
          ` ? { name: ${JSON.stringify(slot.name)}, fn: `,
          ...slotFn(slot, `${inner}  `),
          ' } : null',
        ];
        out.push(`\n${inner}  `, ...closure('()', test.scopes, entry), ',');
      }
      out.push(`\n${inner}],`);
    }
    out.push(`\n${ind}}`);
    return out;
  }

  /** Arguments without trailing absent ones; an absent one before a present one is `{}`. */
  const args = (items: (Code | null)[]): Code => {
    while (items.at(-1) === null) items.pop();
    return list(items.map((c) => c ?? ['{}']));
  };

  function make(m: MakeIR, ind: string): Code {
    if (m.k === 'if') {
      const [first, ...rest] = m.branches;
      const no: Code | null =
        rest.length === 0
          ? null
          : rest[0].test
            ? ['() => ', ...make({ k: 'if', branches: rest }, ind)]
            : ['() => ', ...block(rest[0].block, ind)];
      return [
        '_createIf(',
        ...args([getter(first.test!), ['() => ', ...block(first.block, ind)], no]),
        ')',
      ];
    }
    if (m.k === 'for') {
      const n = fors++;
      const names = [`_for${n}`, `_for${n}k`, `_for${n}i`];
      const used = m.params.findLastIndex((p) => p !== null) + 1;
      preludes.set(
        m.scope,
        m.params.flatMap((p, i) => (p === null ? [] : [['const ', p, ` = ${names[i]}.value`]])),
      );
      const src = getter(m.source);
      const render = [
        `(${names.slice(0, Math.max(used, 1)).join(', ')}) => `,
        ...block(m.block, ind),
      ];
      let getKey: Code = ['(v) => v'];
      if (m.key) {
        const params = m.params.slice(0, used).map((p, i): Code => (p === null ? [names[i]] : [p]));
        const pre = prelude(m.key.scopes, m.scope);
        const head: Code = ['(', ...list(params), ') => '];
        getKey =
          pre.length > 0
            ? [...head, '{ ', ...pre, 'return ', ...paren(m.key.parts), ' }']
            : [...head, ...paren(m.key.parts)];
      }
      return ['_createFor(', ...list([src, render, getKey]), ')'];
    }
    if (m.k === 'keyed') {
      return ['_createKeyed(', ...getter(m.key), ', () => ', ...block(m.block, ind), ')'];
    }
    if (m.k === 'component') {
      const is = typeof m.is === 'string' ? [m.is] : getter(m.is);
      const fn = typeof m.is === 'string' ? '_createComponent(' : '_createDynamicComponent(';
      const rest = [
        props(m.props, m.spread, ind),
        slotsOf(m.slots, ind),
        m.singleRoot ? ['true'] : null,
      ];
      return [fn, ...args([is, ...rest]), ')'];
    }
    const fallback = m.fallback && ['() => ', ...block(m.fallback, ind)];
    const name = [JSON.stringify(m.name)];
    return ['_createSlot(', ...args([name, props(m.props, m.spread, ind), fallback]), ')'];
  }

  const templates = ir.templates.map(({ html, ns }, i) => {
    const nsArg = ns ? `, ${JSON.stringify(ns)}` : '';
    return `const _t${i} = _template(${JSON.stringify(html)}${nsArg})\n`;
  });
  const code: Code = [
    ...templates,
    'function _render($setup: any, $props: any, $ctx: any) ',
    ...block(ir.block, ''),
    '\n',
  ];

  // Writes the code and maps each user part at its start, tracking the output line and column.
  let out = '';
  let column = 0;
  for (const part of code) {
    if (typeof part !== 'string') {
      const pos = lines.position(part.offset);
      addSegment(map, line, column, o.filename, pos.line - 1, pos.column - 1);
    }
    const t = typeof part === 'string' ? part : part.code;
    out += t;
    const breaks = t.split('\n');
    if (breaks.length > 1) {
      line += breaks.length - 1;
      column = breaks.at(-1)!.length;
    } else column += t.length;
  }
  return out;
}
