import { recordValue } from '../di/injector.ts';
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

/** The built objects of the graph in init order; an object shared by several tokens once. */
function targets(graph: ModuleGraph): object[] {
  const values = new Set<object>();
  for (const node of graph.modules) {
    for (const rec of node.hookTargets) {
      const value = recordValue(rec);
      if (typeof value === 'object' && value !== null) values.add(value);
    }
  }
  return [...values];
}

/** Calls `hook` on each target that has it, one at a time, and reports each failure. */
async function run(
  list: readonly object[],
  hook: Hook,
  args: readonly unknown[],
  failed?: (target: object, error: unknown) => void,
): Promise<void> {
  for (const target of list) {
    const fn: unknown = Reflect.get(target, hook);
    if (typeof fn !== 'function') continue;
    try {
      await Reflect.apply(fn, target, args);
    } catch (error) {
      if (!failed) throw error;
      failed(target, error);
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
    await run(list, hook, args, (target, error) => {
      errors.push(error);
      hooks.push(`${target.constructor.name}.${hook}`);
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
