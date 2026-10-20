import {
  parseSync,
  type ArrayExpression,
  type BindingPattern,
  type Expression,
  type ObjectExpression,
  type Program,
  type PropertyKey as Key,
} from 'oxc-parser';

type Literal = ArrayExpression | ObjectExpression;
type Item = ArrayExpression['elements'][number] | ObjectExpression['properties'][number];

export interface Target {
  /** The import declaration to add, without a line break. */
  import?: string;
  /** The array element or object property to add. */
  element: string;
  /** Identifies the element: an identifier, a property key or a route `path`. */
  key: string;
  /** The array or object literal to add the element to. */
  find(program: Program): Literal | undefined;
  /** Write a single-line literal on several lines, one element per line. */
  multiline?: boolean;
  /** What to add by hand when the literal is not found. */
  instruction: string;
}

/** The name of an identifier, a property key or a string literal. */
function nameOf(
  node: Expression | Item | Key | BindingPattern | null | undefined,
): string | undefined {
  if (node?.type === 'Identifier') return node.name;
  if (node?.type === 'Literal') return typeof node.value === 'string' ? node.value : undefined;
  if (node?.type === 'Property') return node.computed ? undefined : nameOf(node.key);
  return undefined;
}

/** What identifies an element: its name, `X` of `X.forRoot()`, or the `path` of an object. */
function keyOf(node: Item | null): string | undefined {
  if (node?.type === 'CallExpression' && node.callee.type === 'MemberExpression')
    return nameOf(node.callee.object);
  if (node?.type !== 'ObjectExpression') return nameOf(node);
  const path = node.properties.find((p) => nameOf(p) === 'path');
  return path?.type === 'Property' ? nameOf(path.value) : undefined;
}

const itemsOf = (literal: Literal): Item[] =>
  literal.type === 'ArrayExpression' ? literal.elements : literal.properties;

/** The leading whitespace of the line holding `offset`. */
function indentAt(text: string, offset: number): string {
  const start = text.lastIndexOf('\n', offset - 1) + 1;
  return /^[ \t]*/.exec(text.slice(start))![0];
}

/** The literal's source with `element` appended, in its single- or multi-line layout. */
function append(text: string, literal: Literal, element: string, multiline: boolean): string {
  const source = text.slice(literal.start, literal.end);
  const [open, close] = [source[0], source.at(-1)!];
  const items = itemsOf(literal).filter((item) => item !== null);
  const base = indentAt(text, literal.start);
  const last = items.at(-1);
  if (!source.includes('\n') && (multiline || !last)) {
    if (!multiline) return `${open}${open === '{' ? ` ${element} ` : element}${close}`;
    // ponytail: comments inside a single-line literal are dropped when it breaks onto lines.
    const lines = [...items.map((item) => text.slice(item.start, item.end)), element];
    return `${open}\n${lines.map((line) => `${base}  ${line},\n`).join('')}${base}${close}`;
  }
  if (!last) return `${open}\n${base}  ${element},\n${base}${close}`;
  const end = last.end - literal.start;
  if (!source.includes('\n')) return `${source.slice(0, end)}, ${element}${source.slice(end)}`;
  const comma = /^\s*,/.exec(source.slice(end))?.[0];
  // After the line of the last element, so a trailing comment stays on that element.
  const eol = source.indexOf('\n', end + (comma?.length ?? 0));
  const at = eol === -1 ? end + (comma?.length ?? 0) : eol;
  const line = `\n${indentAt(text, last.start)}${element}${comma ? ',' : ''}`;
  return `${source.slice(0, end)}${comma ? '' : ','}${source.slice(end, at)}${line}${source.slice(at)}`;
}

/**
 * `text` with `target.element` added to its literal and `target.import` after the last import;
 * `registered` when the element is there, the `manual` instruction when the literal is not found.
 */
export function register(
  text: string,
  target: Target,
): { text: string } | { registered: true } | { manual: string } {
  const { program, errors } = parseSync('file.ts', text, { lang: 'ts', sourceType: 'module' });
  const literal = errors.length ? undefined : target.find(program);
  if (!literal) return { manual: target.instruction };
  if (itemsOf(literal).some((item) => keyOf(item) === target.key)) return { registered: true };
  const updated = append(text, literal, target.element, target.multiline === true);
  const edits: [start: number, end: number, text: string][] = [
    [literal.start, literal.end, updated],
  ];
  const imports = program.body.filter((s) => s.type === 'ImportDeclaration');
  const bound = imports.some((s) => s.specifiers.some((x) => x.local.name === target.element));
  if (target.import && !bound) {
    const at = imports.at(-1)?.end;
    edits.push(at === undefined ? [0, 0, `${target.import}\n`] : [at, at, `\n${target.import}`]);
  }
  // From the end, so each edit keeps the offsets of the ones before it valid.
  edits.sort((a, b) => b[0] - a[0]);
  return { text: edits.reduce((out, [s, e, add]) => out.slice(0, s) + add + out.slice(e), text) };
}

const callee = (node: Expression | null | undefined, name: string) =>
  node?.type === 'CallExpression' && nameOf(node.callee) === name ? node : undefined;

/** The `imports` array of `@Module({...})` on the exported class `AppModule`. */
export function appModuleImports(program: Program): Literal | undefined {
  for (const s of program.body) {
    const c = s.type === 'ExportNamedDeclaration' ? s.declaration : undefined;
    if (c?.type !== 'ClassDeclaration' || c.id?.name !== 'AppModule') continue;
    for (const d of c.decorators) {
      const options = callee(d.expression, 'Module')?.arguments[0];
      if (options?.type !== 'ObjectExpression') continue;
      const imports = options.properties.find((p) => nameOf(p) === 'imports');
      if (imports?.type === 'Property' && imports.value.type === 'ArrayExpression')
        return imports.value;
    }
  }
  return undefined;
}

/** The object literal of `const contracts = {...}`. */
export function contractsObject(program: Program): Literal | undefined {
  for (const s of program.body) {
    const decl = s.type === 'ExportNamedDeclaration' ? s.declaration : s;
    if (decl?.type !== 'VariableDeclaration') continue;
    const init = decl.declarations.find((d) => nameOf(d.id) === 'contracts')?.init;
    if (init?.type === 'ObjectExpression') return init;
  }
  return undefined;
}

/** The array argument of the first `defineRoutes([...])` in a top-level declaration. */
export function routesArray(program: Program): Literal | undefined {
  for (const s of program.body) {
    const decl = s.type === 'ExportNamedDeclaration' ? s.declaration : s;
    if (decl?.type !== 'VariableDeclaration') continue;
    for (const d of decl.declarations) {
      const array = callee(d.init, 'defineRoutes')?.arguments[0];
      if (array?.type === 'ArrayExpression') return array;
    }
  }
  return undefined;
}
