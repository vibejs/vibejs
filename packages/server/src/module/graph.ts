import type { Route } from '@vibejs-org/contract';
import { providerRecord, type Provider, type ProviderRecord, type Scope } from '../di/injector.ts';
import { tokenName, type Class, type Token } from '../di/token.ts';
import { vibeError } from '../errors.gen.ts';
import { moduleOptions, readMeta, type ClassMeta, type MetadataKey } from './decorators.ts';

/** What `@Module()` declares. */
export interface ModuleOptions {
  readonly imports?: readonly ModuleImport[];
  readonly providers?: readonly Provider[];
  readonly controllers?: readonly (new () => object)[];
  /** Own provider tokens, and imported modules whose exports this module passes on. */
  readonly exports?: readonly (Token<unknown> | ModuleImport)[];
  /** Makes the exports visible to every module, without an import. */
  readonly global?: boolean;
}

/** A module class with extra options; the object itself is the module's identity. */
export interface DynamicModule extends ModuleOptions {
  readonly module: Class;
}

export type ModuleImport = Class | DynamicModule;

/** One module of a scanned application. */
export interface ModuleNode {
  readonly module: ModuleImport;
  /** The name of the module class. */
  readonly name: string;
  /** The first import path that reached the module, such as `AppModule > UsersModule`. */
  readonly path: string;
  readonly scope: Scope;
  readonly global: boolean;
  readonly imports: readonly ModuleNode[];
  /** The token names of the own providers, after last-wins. */
  readonly providers: readonly string[];
  /** The names of the exported tokens and modules, as declared. */
  readonly exports: readonly string[];
  /** Providers (after last-wins), controllers, enhancers and the module class, in that order. */
  readonly hookTargets: readonly ProviderRecord[];
}

/** A route with its handler and the records of its enhancers. */
export interface RouteBinding {
  readonly route: Route;
  readonly key: string | symbol;
  readonly controller: ProviderRecord;
  /** Class guards, then method guards; source order in each. */
  readonly guards: readonly ProviderRecord[];
  /** Class interceptors, then method interceptors. */
  readonly interceptors: readonly ProviderRecord[];
  /** Method filters, then class filters, in the order they are tried. */
  readonly filters: readonly ProviderRecord[];
  /** Class metadata merged with method metadata; the method value wins. */
  readonly metadata: ReadonlyMap<MetadataKey<unknown>, unknown>;
}

/** A validated application: its modules, the records to build, and the bound routes. */
export interface ModuleGraph {
  readonly root: ModuleNode;
  /** Depth-first post-order, deepest first. */
  readonly modules: readonly ModuleNode[];
  /** The order to pass to `instantiate()`. */
  readonly records: readonly ProviderRecord[];
  readonly routes: readonly RouteBinding[];
}

interface Node extends ModuleNode {
  readonly imports: readonly Node[];
  readonly own: ReadonlyMap<unknown, ProviderRecord>;
  readonly exported: ReadonlySet<unknown>;
  readonly reexports: readonly Node[];
}

const isDynamic = (value: unknown): value is DynamicModule =>
  typeof value === 'object' && value !== null && 'module' in value;
const moduleClass = (imp: ModuleImport): Class => (isDynamic(imp) ? imp.module : imp);
const routeName = (route: Route): string => `${route.method} ${route.path}`;

/** The record that `node` exports for `token`, directly or through a re-exported module. */
function exported(node: Node, token: Token<unknown>): ProviderRecord | undefined {
  if (node.exported.has(token)) return node.own.get(token);
  return node.reexports.map((child) => exported(child, token)).find(Boolean);
}

type Contract = Readonly<Record<string, Route>>;

/** Binds every route of a controller's contract to its handler (VIBE9303-9306). */
function bind(
  controller: ProviderRecord,
  meta: ClassMeta,
  contract: Contract,
  classRecord: (cls: Class) => ProviderRecord,
  served: Map<Contract, string>,
): RouteBinding[] {
  const name = tokenName(controller.token);
  const other = served.get(contract);
  if (other !== undefined) throw vibeError('VIBE9306', { controllers: `${other}, ${name}` });
  served.set(contract, name);
  const routes = Object.values(contract);
  const keys = new Map<Route, (string | symbol)[]>();
  for (const [key, route] of meta.handlers) {
    if (!routes.includes(route)) {
      throw vibeError('VIBE9305', { method: String(key), controller: name });
    }
    keys.set(route, [...(keys.get(route) ?? []), key]);
  }
  const recordsOf = (classes: readonly Class[]) => classes.map((cls) => classRecord(cls));
  return routes.map((route) => {
    const handlers = keys.get(route);
    if (!handlers) throw vibeError('VIBE9303', { route: routeName(route), controller: name });
    if (handlers.length > 1) {
      const methods = handlers.map(String).join(', ');
      throw vibeError('VIBE9304', { route: routeName(route), controller: name, methods });
    }
    const [key] = handlers;
    const { guards, interceptors, filters, metadata } = meta.enhancers;
    const method = meta.methods.get(key);
    return {
      route,
      key,
      controller,
      guards: recordsOf([...guards, ...(method?.guards ?? [])]),
      interceptors: recordsOf([...interceptors, ...(method?.interceptors ?? [])]),
      filters: recordsOf([...(method?.filters ?? []), ...filters]),
      metadata: new Map([...metadata, ...(method?.metadata ?? [])]),
    };
  });
}

/**
 * Walks the imports from `root`, validates modules, exports, controllers and handlers, and creates
 * the records of every module. Nothing is constructed.
 */
export function scan(root: ModuleImport): ModuleGraph {
  const nodes = new Map<ModuleImport, Node>();
  const modules: Node[] = [];
  const records: ProviderRecord[] = [];
  const routes: RouteBinding[] = [];
  const served = new Map<Contract, string>();

  const visit = (imp: ModuleImport, stack: readonly ModuleImport[]): Node => {
    const names = [...stack, imp].map((m) => tokenName(moduleClass(m)));
    const start = stack.indexOf(imp);
    if (start >= 0) throw vibeError('VIBE9202', { cycle: names.slice(start).join(' > ') });
    const seen = nodes.get(imp);
    if (seen) return seen;
    const cls = moduleClass(imp);
    const path = names.join(' > ');
    const options = moduleOptions(cls);
    if (!options) throw vibeError('VIBE9201', { module: tokenName(cls), path });
    const extra: ModuleOptions = isDynamic(imp) ? imp : {};
    const list = <K extends 'imports' | 'providers' | 'controllers' | 'exports'>(key: K) => [
      ...(options[key] ?? []),
      ...(extra[key] ?? []),
    ];
    const importList = list('imports');
    const imports = importList.map((child) => visit(child, [...stack, imp]));

    const own = new Map<unknown, ProviderRecord>();
    const scope: Scope = {
      path,
      find: (token) =>
        own.get(token) ??
        imports.map((child) => exported(child, token)).find(Boolean) ??
        modules
          .filter((m) => m.global)
          .map((m) => exported(m, token))
          .find(Boolean),
    };
    for (const provider of list('providers')) {
      const rec = providerRecord(provider, scope);
      own.delete(rec.token);
      own.set(rec.token, rec);
    }
    const exportedTokens = new Set<unknown>();
    const reexports: Node[] = [];
    const exportNames: string[] = [];
    for (const entry of list('exports')) {
      const index = importList.findIndex((i) => i === entry);
      const name = isDynamic(entry) ? tokenName(entry.module) : tokenName(entry);
      exportNames.push(name);
      if (own.has(entry)) exportedTokens.add(entry);
      else if (index >= 0) reexports.push(imports[index]);
      else throw vibeError('VIBE9203', { export: name, module: path });
    }

    // Controllers, enhancers and the module class: one record per class, never found by tokens.
    const classes = new Map<Class, ProviderRecord>();
    const classRecord = (c: Class): ProviderRecord => {
      let rec = classes.get(c);
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- providerRecord() rejects a class with constructor parameters (VIBE9104)
      if (!rec) classes.set(c, (rec = providerRecord(c as new () => object, scope)));
      return rec;
    };
    const controllers = list('controllers').map((c) => {
      const meta = readMeta(c);
      if (!meta?.contract) {
        throw vibeError('VIBE9302', { controller: tokenName(c), module: path });
      }
      return { meta, contract: meta.contract, rec: classRecord(c) };
    });
    for (const { meta, contract, rec } of controllers) {
      routes.push(...bind(rec, meta, contract, classRecord, served));
    }
    classRecord(cls);

    const hookTargets = [...own.values(), ...classes.values()];
    const node: Node = {
      module: imp,
      name: tokenName(cls),
      path,
      scope,
      global: Boolean(options.global || extra.global),
      imports,
      providers: [...own.values()].map((rec) => tokenName(rec.token)),
      exports: exportNames,
      hookTargets,
      own,
      exported: exportedTokens,
      reexports,
    };
    nodes.set(imp, node);
    modules.push(node);
    records.push(...hookTargets);
    return node;
  };

  return { root: visit(root, []), modules, records, routes };
}
