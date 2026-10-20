import { visitorKeys } from 'oxc-parser';

/** An ESTree node from oxc-parser, read through its visitor keys. Spans are UTF-16 offsets. */
export interface Node {
  type: string;
  start: number;
  end: number;
  [key: string]: unknown;
}

export interface Identifier extends Node {
  name: string;
}

/** `local`: bound inside the walked code. `writeRoot`: the root of an assignment or update target. */
export interface RefInfo {
  local: boolean;
  writeRoot: boolean;
}

export interface WalkHandlers {
  /**
   * An identifier reference; `shorthand` when it is the value of a shorthand property `{ a }`.
   * `scopes` holds the names visible at the reference, read during the call only.
   */
  ref(id: Identifier, info: RefInfo, shorthand: boolean, scopes: readonly Set<string>[]): void;
  /** A name declared inside the walked code, once per declaration. */
  bind?(id: Identifier): void;
  /** A `this` outside every non-arrow function and class member value. */
  this?(node: Node): void;
}

/** read: a value; write: an assignment target; decl: a binding pattern. */
type Mode = 'read' | 'write' | 'decl';

/** Keys that hold only types. */
const TYPE_KEYS = new Set([
  'typeAnnotation',
  'typeArguments',
  'typeParameters',
  'returnType',
  'superTypeArguments',
  'implements',
]);
/** TypeScript nodes that wrap a value; every other `TS*` node is a type or a declaration of one. */
const TS_VALUES = new Set([
  'TSAsExpression',
  'TSSatisfiesExpression',
  'TSNonNullExpression',
  'TSInstantiationExpression',
  'TSTypeAssertion',
]);
/** Nodes whose children keep the mode of their parent. */
const PASS_MODE = new Set(['ArrayPattern', 'ObjectPattern', 'RestElement', ...TS_VALUES]);
export const FUNCTIONS: ReadonlySet<string> = new Set([
  'FunctionDeclaration',
  'FunctionExpression',
  'ArrowFunctionExpression',
]);
const LABELS = new Set(['LabeledStatement', 'BreakStatement', 'ContinueStatement']);

const isNode = (value: unknown): value is Node =>
  typeof value === 'object' && value !== null && 'type' in value;

export const isIdentifier = (node: Node): node is Identifier => node.type === 'Identifier';

const NONE: readonly Node[] = [];

/**
 * The nodes under `node[key]`, which holds a node, an array of nodes (with `null` holes) or
 * nothing. An array without holes is returned as it is: callers only read the result.
 */
export const children = (node: Node, key: string): readonly Node[] => {
  const value = node[key];
  if (Array.isArray(value)) return value.every(isNode) ? value : value.filter(isNode);
  return isNode(value) ? [value] : NONE;
};

/** The identifiers under `node[key]`. */
const ids = (node: Node, key: string): Identifier[] => children(node, key).filter(isIdentifier);

/** The identifiers that a binding pattern declares, in source order. */
export function patternIds(pattern: Node): Identifier[] {
  if (isIdentifier(pattern)) return [pattern];
  // AssignmentPattern: only `left`; Property: only `value`; RestElement, ArrayPattern, ObjectPattern.
  const keys =
    pattern.type === 'AssignmentPattern'
      ? ['left']
      : ['value', 'argument', 'elements', 'properties'];
  return keys.flatMap((key) => children(pattern, key).flatMap(patternIds));
}

/** The identifiers that the declarators of a variable declaration declare. */
const declaratorIds = (declaration: Node): Identifier[] =>
  children(declaration, 'declarations').flatMap((d) => children(d, 'id').flatMap(patternIds));

/** The names a statement list declares in its own block: `let`, `const`, functions and classes. */
function blockIds(statements: readonly Node[]): Identifier[] {
  return statements.flatMap((s) => {
    if (s.type === 'VariableDeclaration' && s.kind !== 'var') return declaratorIds(s);
    return s.type === 'FunctionDeclaration' || s.type === 'ClassDeclaration' ? ids(s, 'id') : [];
  });
}

/**
 * The `var` names declared anywhere under `node`, without entering nested functions, into `out`.
 * The recursive walks over every node use index loops: a `for…of` there allocates an iterator
 * result per step until V8 optimizes the function, which a recursive walk rarely reaches.
 */
function varIds(node: Node, out: Identifier[] = []): Identifier[] {
  if (FUNCTIONS.has(node.type)) return out;
  if (node.type === 'VariableDeclaration' && node.kind === 'var') out.push(...declaratorIds(node));
  const keys = visitorKeys[node.type];
  for (let k = 0; k < keys.length; k++) {
    const list = children(node, keys[k]);
    for (let i = 0; i < list.length; i++) varIds(list[i], out);
  }
  return out;
}

/** The statements of a scope-creating statement list. */
function statementsOf(node: Node): readonly Node[] {
  return node.type === 'SwitchStatement'
    ? children(node, 'cases').flatMap((c) => children(c, 'consequent'))
    : children(node, 'body');
}

/**
 * Walks an ESTree tree and reports every identifier reference with its scope facts. It tracks
 * function and arrow parameters, `var` (function scope), `let`, `const`, functions and classes
 * (block scope) and catch parameters. It skips non-computed member properties and object keys,
 * labels and every type position. `bound` names count as local everywhere.
 */
export function walk(root: Node, handlers: WalkHandlers, bound: Iterable<string> = []): void {
  const scopes: Set<string>[] = [new Set(bound)];
  /** The depth of the nodes that bind their own `this`. */
  let functions = 0;
  const ownThis = (body: () => void) => {
    functions++;
    body();
    functions--;
  };
  const isLocal = (name: string) => scopes.some((scope) => scope.has(name));

  const enter = (declared: Identifier[], body: () => void) => {
    const scope = new Set<string>();
    for (const id of declared) {
      scope.add(id.name);
      handlers.bind?.(id);
    }
    scopes.push(scope);
    body();
    scopes.pop();
  };

  /** Visits the nodes under `node[key]`. */
  const at = (node: Node, key: string, mode: Mode = 'read', shorthand = false) => {
    const list = children(node, key);
    for (let i = 0; i < list.length; i++) visit(list[i], mode, shorthand);
  };
  const visitKeys = (node: Node, mode: Mode) => {
    const keys = visitorKeys[node.type];
    for (let i = 0; i < keys.length; i++) if (!TYPE_KEYS.has(keys[i])) at(node, keys[i], mode);
  };

  function visit(node: Node, mode: Mode = 'read', shorthand = false): void {
    const { type } = node;
    if (type.startsWith('TS') && !TS_VALUES.has(type)) return;
    if (isIdentifier(node)) {
      const info = { local: isLocal(node.name), writeRoot: mode === 'write' };
      if (mode !== 'decl') handlers.ref(node, info, shorthand, scopes);
      return;
    }
    switch (type) {
      case 'ThisExpression':
        if (functions === 0) handlers.this?.(node);
        return;
      case 'MetaProperty':
        return;
      case 'MemberExpression':
        at(node, 'object', mode);
        if (node.computed) at(node, 'property');
        return;
      case 'Property':
      case 'MethodDefinition':
        if (node.computed) at(node, 'key');
        at(node, 'value', mode, node.shorthand === true);
        return;
      case 'PropertyDefinition':
      case 'AccessorProperty':
        // A field value reads the instance as `this`; a computed key reads the outer one.
        if (node.computed) at(node, 'key');
        ownThis(() => at(node, 'value'));
        return;
      case 'AssignmentPattern':
        at(node, 'left', mode, shorthand);
        at(node, 'right');
        return;
      case 'AssignmentExpression':
        at(node, 'left', 'write');
        at(node, 'right');
        return;
      case 'UpdateExpression':
        at(node, 'argument', 'write');
        return;
      case 'VariableDeclarator':
        at(node, 'id', 'decl');
        at(node, 'init');
        return;
      case 'CatchClause': {
        const params = children(node, 'param');
        enter(params.flatMap(patternIds), () => {
          at(node, 'param', 'decl');
          at(node, 'body');
        });
        return;
      }
      case 'ForStatement':
      case 'ForInStatement':
      case 'ForOfStatement': {
        const head = children(node, type === 'ForStatement' ? 'init' : 'left');
        enter(blockIds(head), () => {
          for (const key of visitorKeys[type]) {
            for (const child of children(node, key)) {
              visit(
                child,
                key === 'left' && child.type !== 'VariableDeclaration' ? 'write' : 'read',
              );
            }
          }
        });
        return;
      }
      case 'Program':
        enter([...varIds(node), ...blockIds(statementsOf(node))], () => visitKeys(node, 'read'));
        return;
      case 'StaticBlock':
        ownThis(() => enter(blockIds(statementsOf(node)), () => visitKeys(node, 'read')));
        return;
      case 'BlockStatement':
      case 'SwitchStatement':
        enter(blockIds(statementsOf(node)), () => visitKeys(node, 'read'));
        return;
      case 'ClassExpression':
      case 'ClassDeclaration':
        // A class expression's name is bound inside the class; a declaration's in its block.
        enter(type === 'ClassExpression' ? ids(node, 'id') : [], () => {
          for (const key of ['decorators', 'superClass', 'body']) at(node, key);
        });
        return;
      case 'FunctionDeclaration':
      case 'FunctionExpression':
      case 'ArrowFunctionExpression': {
        const params = children(node, 'params');
        const own = type === 'FunctionExpression' ? ids(node, 'id') : [];
        const body = children(node, 'body');
        const arrow = type === 'ArrowFunctionExpression';
        enter([...own, ...params.flatMap(patternIds), ...body.flatMap((b) => varIds(b))], () => {
          if (!arrow) functions++;
          at(node, 'params', 'decl');
          at(node, 'body');
          if (!arrow) functions--;
        });
        return;
      }
    }
    if (LABELS.has(type)) {
      at(node, 'body');
      return;
    }
    visitKeys(node, PASS_MODE.has(type) ? mode : 'read');
  }

  visit(root);
}
