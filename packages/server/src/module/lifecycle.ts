import { recordValue, type ProviderRecord } from '../di/injector.ts';
import { tokenName } from '../di/token.ts';
import { vibeError } from '../errors.gen.ts';
import type { ModuleGraph } from './graph.ts';

/** Runs after every provider of the application has been created. */
export interface OnModuleInit {
  onModuleInit(): void | Promise<void>;
}

/** Runs after every `onModuleInit` hook. */
export interface OnApplicationBootstrap {
  onApplicationBootstrap(): void | Promise<void>;
}

/** Runs first on shutdown, in reverse init order. */
export interface OnModuleDestroy {
  onModuleDestroy(): void | Promise<void>;
}

/** Runs after every `onModuleDestroy` hook, with the signal that stopped the application. */
export interface OnApplicationShutdown {
  onApplicationShutdown(signal?: string): void | Promise<void>;
}

type Hook = 'onModuleInit' | 'onApplicationBootstrap' | 'onModuleDestroy' | 'onApplicationShutdown';

type Target = readonly [value: object, rec: ProviderRecord];

/** The built objects of the graph in init order, each once with the first record that built it. */
function targets(graph: ModuleGraph): Target[] {
  const values = new Map<object, ProviderRecord>();
  for (const node of graph.modules) {
    for (const rec of node.hookTargets) {
      const value = recordValue(rec);
      if (typeof value === 'object' && value !== null && !values.has(value)) values.set(value, rec);
    }
  }
  return [...values];
}

/** Calls `hook` on each target that has it, one at a time, and reports each failure. */
async function run(
  list: readonly Target[],
  hook: Hook,
  args: readonly unknown[],
  failed?: (rec: ProviderRecord, error: unknown) => void,
): Promise<void> {
  for (const [target, rec] of list) {
    const fn: unknown = Reflect.get(target, hook);
    if (typeof fn !== 'function') continue;
    try {
      await Reflect.apply(fn, target, args);
    } catch (error) {
      if (!failed) throw error;
      failed(rec, error);
    }
  }
}

/** Runs `onModuleInit` on every target, then `onApplicationBootstrap`; the first error stops it. */
export async function init(graph: ModuleGraph): Promise<void> {
  const list = targets(graph);
  await run(list, 'onModuleInit', []);
  await run(list, 'onApplicationBootstrap', []);
}

/**
 * Runs `onModuleDestroy`, then `onApplicationShutdown(signal)`, each in reverse init order. Every
 * hook runs; failures are thrown together afterwards as VIBE9204.
 */
export async function shutdown(graph: ModuleGraph, signal?: string): Promise<void> {
  const list = targets(graph).toReversed();
  const errors: unknown[] = [];
  const hooks: string[] = [];
  for (const [hook, args] of [
    ['onModuleDestroy', []],
    ['onApplicationShutdown', [signal]],
  ] as const) {
    await run(list, hook, args, (rec, error) => {
      errors.push(error);
      hooks.push(`${tokenName(rec.token)}.${hook}`);
    });
  }
  if (errors.length > 0) {
    throw vibeError(
      'VIBE9204',
      { count: errors.length, hooks: hooks.join(', ') },
      { cause: new AggregateError(errors) },
    );
  }
}
