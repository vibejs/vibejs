// oxlint-disable typescript/no-unsafe-type-assertion -- providerRecord() creates every record, and a record holds a value of its token's type
import { isVibeError } from '@vibejs-org/errors';
import { vibeError } from '../errors.gen.ts';
import { tokenName, type Token } from './token.ts';

export interface InjectOptions {
  readonly optional: true;
}

/** Resolves tokens outside the container's own construction, through `runInInjectionContext`. */
export interface Injector {
  get<T>(token: Token<T>): T;
}

/** A class with no constructor parameters, or a token with exactly one way to create its value. */
export type Provider =
  | (new () => object)
  | { readonly provide: Token<unknown>; readonly useClass: new () => unknown }
  | { readonly provide: Token<unknown>; readonly useValue: unknown }
  | {
      readonly provide: Token<unknown>;
      readonly useFactory: (...deps: never[]) => unknown;
      readonly inject?: readonly Token<unknown>[];
    }
  | { readonly provide: Token<unknown>; readonly useExisting: Token<unknown> };

/** The providers visible from one module. */
export interface Scope {
  /** The import path of the module, such as `AppModule > UsersModule`, used in messages. */
  readonly path: string;
  find(token: Token<unknown>): ProviderRecord | undefined;
}

/** One provider of one scope; it holds a single instance. */
export interface ProviderRecord {
  readonly token: Token<unknown>;
  readonly scope: Scope;
}

interface Rec extends ProviderRecord {
  readonly cls?: new () => unknown;
  readonly factory?: (...deps: never[]) => unknown;
  readonly deps: readonly Token<unknown>[];
  done: boolean;
  value?: unknown;
}

type Context =
  | { readonly scope: Scope; readonly chain: readonly Rec[] }
  | { readonly injector: Injector };

let current: Context | undefined;

function within<T>(context: Context, fn: () => T): T {
  const previous = current;
  current = context;
  try {
    return fn();
  } finally {
    current = previous;
  }
}

const name = (rec: ProviderRecord): string => tokenName(rec.token);

/** Reads a dependency inside a constructor, a factory's synchronous part or `runInInjectionContext`. */
export function inject<T>(token: Token<T>): T;
export function inject<T>(token: Token<T>, options: InjectOptions): T | undefined;
export function inject<T>(token: Token<T>, options?: InjectOptions): T | undefined {
  const context = current;
  if (!context) throw vibeError('VIBE9101', { token: tokenName(token) });
  if ('injector' in context) {
    try {
      return context.injector.get(token);
    } catch (error) {
      if (options && isVibeError(error, 'VIBE9102')) return undefined;
      throw error;
    }
  }
  const rec = context.scope.find(token);
  if (rec) return resolveSync(rec as Rec, context.chain) as T;
  if (options) return undefined;
  throw missing(context.scope, token, context.chain);
}

/** Runs `fn` with `injector` as the injection context of `inject()`. */
export function runInInjectionContext<T>(injector: Injector, fn: () => T): T {
  return within({ injector }, fn);
}

const KINDS = ['useClass', 'useValue', 'useFactory', 'useExisting'];

/** Validates one provider entry and turns it into a record declared in `scope`. */
export function providerRecord(provider: Provider, scope: Scope): ProviderRecord {
  if (typeof provider === 'function') return classRecord(provider, provider, scope);
  if (!isProviderObject(provider)) throw vibeError('VIBE9107');
  const { provide: token } = provider;
  if ('useClass' in provider) return classRecord(token, provider.useClass, scope);
  const rec: Rec =
    'useValue' in provider
      ? { token, scope, deps: [], done: true, value: provider.useValue }
      : 'useExisting' in provider
        ? { token, scope, factory: (x: never) => x, deps: [provider.useExisting], done: false }
        : { token, scope, factory: provider.useFactory, deps: provider.inject ?? [], done: false };
  return rec;
}

function isProviderObject(value: unknown): boolean {
  return (
    typeof value === 'object' &&
    value !== null &&
    'provide' in value &&
    KINDS.filter((kind) => kind in value).length === 1
  );
}

function classRecord(token: Token<unknown>, cls: new () => unknown, scope: Scope): Rec {
  if (cls.length > 0) throw vibeError('VIBE9104', { token: tokenName(cls) });
  return { token, scope, cls, deps: [], done: false };
}

/**
 * Builds every record: phase A awaits the factories (those without class deps first), phase B
 * creates the classes, each in the caller's order. Dependencies are built on demand.
 */
export async function instantiate(records: readonly ProviderRecord[]): Promise<void> {
  const factories = (records as readonly Rec[]).filter((rec) => rec.factory);
  const classFree = factories.filter((rec) => !rec.deps.some((dep) => typeof dep === 'function'));
  for (const rec of new Set([...classFree, ...factories])) await resolveAsync(rec, []);
  for (const rec of records as readonly Rec[]) resolveSync(rec, []);
}

/** The instance of `token` as seen from `scope`. */
export function get<T>(scope: Scope, token: Token<T>): T {
  const rec = scope.find(token);
  if (!rec) throw missing(scope, token, []);
  return resolveSync(rec as Rec, []) as T;
}

function missing(scope: Scope, token: Token<unknown>, chain: readonly Rec[]) {
  const names = [...chain.map(name), tokenName(token)];
  return vibeError('VIBE9102', {
    token: tokenName(token),
    module: scope.path,
    chain: names.join(' -> '),
  });
}

/** Returns the chain extended by `rec`, or throws VIBE9103 when `rec` is already on it. */
function enter(rec: Rec, chain: readonly Rec[]): readonly Rec[] {
  const next = [...chain, rec];
  const start = chain.indexOf(rec);
  if (start >= 0) {
    const cycle = next.slice(start).map(name).join(' -> ');
    throw vibeError('VIBE9103', { cycle, module: rec.scope.path });
  }
  return next;
}

function wrap(rec: Rec, error: unknown) {
  if (isVibeError(error)) return error;
  return vibeError('VIBE9105', { token: name(rec), module: rec.scope.path }, { cause: error });
}

function resolveSync(rec: Rec, chain: readonly Rec[]): unknown {
  if (rec.done) return rec.value;
  const next = enter(rec, chain);
  const { cls } = rec;
  if (!cls) {
    const requester = chain.at(-1);
    throw vibeError('VIBE9106', {
      token: name(rec),
      requester: requester ? name(requester) : rec.scope.path,
    });
  }
  try {
    rec.value = within({ scope: rec.scope, chain: next }, () => new cls());
  } catch (error) {
    throw wrap(rec, error);
  }
  rec.done = true;
  return rec.value;
}

async function resolveAsync(rec: Rec, chain: readonly Rec[]): Promise<unknown> {
  const { factory } = rec;
  if (rec.done || !factory) return resolveSync(rec, chain);
  const next = enter(rec, chain);
  try {
    const args: unknown[] = [];
    for (const dep of rec.deps) {
      const found = rec.scope.find(dep);
      if (!found) throw missing(rec.scope, dep, next);
      args.push(await resolveAsync(found as Rec, next));
    }
    rec.value = await within({ scope: rec.scope, chain: next }, () =>
      factory(...(args as never[])),
    );
  } catch (error) {
    throw wrap(rec, error);
  }
  rec.done = true;
  return rec.value;
}
