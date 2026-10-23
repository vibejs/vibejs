import type { Route, RouteReply } from '@usevibejs/contract';
import type { Class } from '../di/token.ts';
import { vibeError } from '../errors.gen.ts';
import type { CanActivate, Ctx, ExceptionFilter, Interceptor } from '../http/context.ts';
import type { ModuleOptions } from './graph.ts';

/** A decorator for a class or for one of its methods. */
export interface EnhancerDecorator {
  (target: Class): void;
  (target: object, key: string | symbol, desc: PropertyDescriptor): void;
}

declare const metadataType: unique symbol;

/** A typed key of route metadata. Keys are compared by identity. */
export interface MetadataKey<T> {
  readonly description: string;
  /** Type-only: carries `T`, never set at runtime. */
  readonly [metadataType]?: T;
}

/** Sets a metadata value on a class or a method; the decorator is also its own key. */
export interface MetadataDecorator<T> extends MetadataKey<T> {
  (value: T): EnhancerDecorator;
}

/** The enhancers of a class or of one method. */
interface Enhancers {
  readonly guards: Class[];
  readonly interceptors: Class[];
  readonly filters: Class[];
  readonly metadata: Map<MetadataKey<unknown>, unknown>;
}

/** What the decorators recorded on a class and its ancestors. */
export interface ClassMeta {
  contract?: Readonly<Record<string, Route>>;
  readonly handlers: Map<string | symbol, Route>;
  readonly enhancers: Enhancers;
  readonly methods: Map<string | symbol, Enhancers>;
}

const modules = new WeakMap<object, ModuleOptions>();
const registry = new WeakMap<object, ClassMeta>();

/** The options of `@Module()` on exactly this class; module options are not inherited. */
export function moduleOptions(cls: object): ModuleOptions | undefined {
  return modules.get(cls);
}

/** The meta of the nearest class on the prototype chain of `cls` that has any. */
export function readMeta(cls: object | null): ClassMeta | undefined {
  for (let c: object | null = cls; c; c = Reflect.getPrototypeOf(c)) {
    const meta = registry.get(c);
    if (meta) return meta;
  }
  return undefined;
}

const emptyEnhancers = (): Enhancers => ({
  guards: [],
  interceptors: [],
  filters: [],
  metadata: new Map(),
});

const cloneEnhancers = (e: Enhancers): Enhancers => ({
  guards: [...e.guards],
  interceptors: [...e.interceptors],
  filters: [...e.filters],
  metadata: new Map(e.metadata),
});

/** The meta of exactly `cls`, copied from its nearest ancestor on the first write. */
function ownMeta(cls: object): ClassMeta {
  let meta = registry.get(cls);
  if (!meta) {
    const parent = readMeta(cls);
    meta = {
      contract: parent?.contract,
      handlers: new Map(parent?.handlers),
      enhancers: parent ? cloneEnhancers(parent.enhancers) : emptyEnhancers(),
      methods: new Map([...(parent?.methods ?? [])].map(([k, e]) => [k, cloneEnhancers(e)])),
    };
    registry.set(cls, meta);
  }
  return meta;
}

/** Throws VIBE9301 when a decorator receives a standard decorator context object. */
function legacy(decorator: string, second: unknown): void {
  if (
    typeof second === 'object' &&
    second !== null &&
    typeof Reflect.get(second, 'kind') === 'string'
  ) {
    throw vibeError('VIBE9301', { decorator });
  }
}

/** Registers the options of a module class. */
export function Module(options: ModuleOptions): (target: Class) => void {
  return (target: Class, context?: unknown): void => {
    legacy('@Module', context);
    modules.set(target, options);
  };
}

/** Makes a class the controller of `contract`; each route needs one `@Handle()` method. */
export function Controller(
  contract: Readonly<Record<string, Route>>,
): (target: new () => object) => void {
  return (target: new () => object, context?: unknown): void => {
    legacy('@Controller', context);
    ownMeta(target).contract = contract;
  };
}

/** Makes a method the handler of `route`; its signature is checked against the route. */
export function Handle<R extends Route>(
  route: R,
): <T extends (ctx: Ctx<R>) => RouteReply<R> | Promise<RouteReply<R>>>(
  target: object,
  key: string | symbol,
  desc: TypedPropertyDescriptor<T>,
) => void {
  return (target: object, key: string | symbol): void => {
    legacy('@Handle', key);
    if (typeof target === 'function') {
      throw vibeError('VIBE9307', {
        decorator: '@Handle',
        controller: target.name,
        method: String(key),
      });
    }
    ownMeta(target.constructor).handlers.set(key, route);
  };
}

/**
 * A class or method decorator that changes the enhancers of its target. A list group lands after
 * the inherited entries and before the groups applied earlier (decorators apply bottom-up).
 */
function enhancer(
  decorator: string,
  apply: (own: Enhancers, inherited: Enhancers | undefined) => void,
): EnhancerDecorator {
  return (target: object, key?: string | symbol): void => {
    legacy(decorator, key);
    if (key !== undefined && typeof target === 'function') {
      throw vibeError('VIBE9307', { decorator, controller: target.name, method: String(key) });
    }
    const cls = key === undefined ? target : target.constructor;
    const meta = ownMeta(cls);
    const parent = readMeta(Reflect.getPrototypeOf(cls));
    if (key === undefined) {
      apply(meta.enhancers, parent?.enhancers);
    } else {
      let own = meta.methods.get(key);
      if (!own) meta.methods.set(key, (own = emptyEnhancers()));
      apply(own, parent?.methods.get(key));
    }
  };
}

type List = 'guards' | 'interceptors' | 'filters';

const listDecorator = (decorator: string, list: List, classes: readonly Class[]) =>
  enhancer(decorator, (own, inherited) => {
    own[list].splice(inherited?.[list].length ?? 0, 0, ...classes);
  });

/** Adds guards to a controller or a handler; they run in source order, class before method. */
export function UseGuards(...guards: readonly (new () => CanActivate)[]): EnhancerDecorator {
  return listDecorator('@UseGuards', 'guards', guards);
}

/** Adds interceptors to a controller or a handler; class interceptors wrap method ones. */
export function UseInterceptors(
  ...interceptors: readonly (new () => Interceptor)[]
): EnhancerDecorator {
  return listDecorator('@UseInterceptors', 'interceptors', interceptors);
}

/** Adds exception filters to a controller or a handler; method filters are tried first. */
export function UseFilters(...filters: readonly (new () => ExceptionFilter)[]): EnhancerDecorator {
  return listDecorator('@UseFilters', 'filters', filters);
}

/** Creates a typed metadata decorator, which is also the key that `ctx.getMetadata()` reads. */
export function createMetadata<T>(description: string): MetadataDecorator<T> {
  const decorator = (value: T): EnhancerDecorator =>
    enhancer(`createMetadata('${description}')`, (own) => {
      own.metadata.set(key, value);
    });
  const key: MetadataDecorator<T> = Object.assign(decorator, { description });
  return key;
}
