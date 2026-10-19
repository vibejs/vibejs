import { children, isIdentifier, type Node } from '../expr/walk.ts';

/** A key and the range of its name, at program offsets. */
export interface Key {
  name: string;
  decl: [number, number];
}

/** The type declarations of the script by name: the parts of a merged interface, or one alias. */
export type TypeDecls = ReadonlyMap<string, Node[]>;

export const first = (node: Node, key: string): Node | undefined => children(node, key)[0];

/** A string field of a node, by default its name. */
export function str(node: Node | undefined, key = 'name'): string | undefined {
  const value = node?.[key];
  return typeof value === 'string' ? value : undefined;
}

/** The name of a non-computed property key: an identifier or a string literal. */
export function keyName(node: Node): string | undefined {
  const key = first(node, 'key');
  if (node.computed || !key) return undefined;
  return isIdentifier(key) ? key.name : str(key, 'value');
}

/** The string literals of a literal type or a union of them, else undefined. */
function literals(node: Node): string[] | undefined {
  const parts = node.type === 'TSUnionType' ? children(node, 'types') : [node];
  const names = parts.map((p) => first(p, 'literal')?.value);
  return names.every((n) => typeof n === 'string') ? names : undefined;
}

/** The members of an interface or a type literal. */
const members = (node: Node): Node[] =>
  node.type === 'TSInterfaceDeclaration'
    ? children(first(node, 'body')!, 'body')
    : children(node, 'members');

/** The in-file declarations a type name refers to, when it has no type arguments. */
function lookup(name: Node, args: Node | undefined, decls: TypeDecls): Node[] | undefined {
  return name.type === 'Identifier' && !args ? decls.get(str(name)!) : undefined;
}

/** The keys of every node, merged by name in order, or undefined when one does not resolve. */
function merged(lists: (Key[] | undefined)[]): Key[] | undefined {
  if (lists.some((list) => list === undefined)) return undefined;
  return [...new Map(lists.flatMap((list) => list!.map((key) => [key.name, key]))).values()];
}

/**
 * The keys of a props type declared in this file, in declaration order without duplicates, or
 * undefined when a part of it does not resolve in this file.
 */
export function propKeys(
  type: Node,
  decls: TypeDecls,
  active: Set<Node> = new Set(),
): Key[] | undefined {
  // `active` holds the nodes being resolved, so a cycle ends while a diamond still resolves.
  if (active.has(type)) return undefined;
  active.add(type);
  const result = resolveProps(type, decls, active);
  active.delete(type);
  return result;
}

function resolveProps(type: Node, decls: TypeDecls, active: Set<Node>): Key[] | undefined {
  const keys = (node: Node) => propKeys(node, decls, active);
  const named = (name: Node, args: Node | undefined) => {
    const found = lookup(name, args, decls);
    return found && merged(found.map(keys));
  };
  switch (type.type) {
    case 'TSTypeLiteral':
    case 'TSInterfaceDeclaration': {
      const own: Key[] = [];
      for (const member of members(type)) {
        const signature =
          member.type === 'TSPropertySignature' || member.type === 'TSMethodSignature';
        const name = signature ? keyName(member) : undefined;
        if (name === undefined) return undefined;
        const key = first(member, 'key')!;
        own.push({ name, decl: [key.start, key.end] });
      }
      const heritage = children(type, 'extends').map((h) =>
        named(first(h, 'expression')!, first(h, 'typeArguments')),
      );
      return merged([own, ...heritage]);
    }
    case 'TSTypeAliasDeclaration':
      return keys(first(type, 'typeAnnotation')!);
    case 'TSIntersectionType':
    case 'TSUnionType':
      return merged(children(type, 'types').map(keys));
    case 'TSTypeReference': {
      const name = first(type, 'typeName')!;
      const typeArgs = first(type, 'typeArguments');
      const args = typeArgs ? children(typeArgs, 'params') : [];
      const util = str(name) ?? '';
      if (['Partial', 'Required', 'Readonly'].includes(util) && args.length === 1) {
        return keys(args[0]);
      }
      if ((util === 'Pick' || util === 'Omit') && args.length === 2) {
        const picked = literals(args[1]);
        const base = picked && keys(args[0]);
        return base?.filter((key) => picked!.includes(key.name) === (util === 'Pick'));
      }
      return named(name, typeArgs);
    }
  }
  return undefined;
}

/** The event names, or the node that is not a record of tuples, or an out-of-file type. */
export type EmitKeys = { keys: string[] } | { invalid: Node } | { unresolved: true };

/** The event names of a record of payload tuples declared in this file. */
export function emitKeys(type: Node, decls: TypeDecls, seen: Set<Node> = new Set()): EmitKeys {
  if (type.type === 'TSTypeReference') {
    const found = lookup(first(type, 'typeName')!, first(type, 'typeArguments'), decls);
    if (!found) return { unresolved: true };
    if (seen.has(type)) return { invalid: type };
    seen.add(type);
    const keys: string[] = [];
    for (const decl of found) {
      const body = decl.type === 'TSTypeAliasDeclaration' ? first(decl, 'typeAnnotation')! : decl;
      const result = emitKeys(body, decls, seen);
      if (!('keys' in result)) return result;
      keys.push(...result.keys);
    }
    return { keys };
  }
  const literal = type.type === 'TSTypeLiteral' || type.type === 'TSInterfaceDeclaration';
  if (!literal || children(type, 'extends').length > 0) return { invalid: type };
  const keys: string[] = [];
  for (const member of members(type)) {
    const name = member.type === 'TSPropertySignature' ? keyName(member) : undefined;
    const value = first(member, 'typeAnnotation');
    if (name === undefined || (value && first(value, 'typeAnnotation'))?.type !== 'TSTupleType') {
      return { invalid: member };
    }
    keys.push(name);
  }
  return { keys };
}
