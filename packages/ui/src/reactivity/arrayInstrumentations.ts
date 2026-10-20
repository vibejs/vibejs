// Upstream: vuejs/core@bf5f0dd877dd3c23ce85c2cbc1dd771567e84c8c packages/reactivity/src/arrayInstrumentations.ts (MIT)
// oxlint-disable typescript/no-explicit-any, typescript/no-unsafe-type-assertion -- the methods forward
// arbitrary arguments to native array methods, which proxies reach untyped
import { endBatch, setActiveSub, startBatch } from './core.ts';
import { ARRAY_ITERATE_KEY, isShallow, toRaw, track } from './dep.ts';

/** Turns a raw item into the value a proxy returns for it. */
export type Wrap = (value: unknown) => unknown;

type Callback = (this: unknown, ...args: any[]) => unknown;
type AnyArray = Record<PropertyKey, any> & unknown[];

const arrayProto = Array.prototype as unknown as AnyArray;

/** Tracks every item of `array` and returns its raw array. */
function shallowReadArray<T>(array: T[]): T[] {
  track((array = toRaw(array)), ARRAY_ITERATE_KEY);
  return array;
}

/**
 * Tracks every item of `array` and returns them as the proxy would (raw for a raw array); `wrap`
 * is the wrap of the proxy, `wrapperFor(array)` in `reactive.ts`.
 */
export function reactiveReadArray<T>(array: T[], wrap: Wrap): T[] {
  const raw = toRaw(array);
  if (raw === array) return raw;
  track(raw, ARRAY_ITERATE_KEY);
  return isShallow(array) ? raw : (raw.map(wrap) as T[]);
}

/** Searches the raw array, then again with a raw argument, so a raw item and its proxy match. */
function search(self: unknown[], method: string, args: unknown[]): unknown {
  const raw = shallowReadArray(self) as AnyArray;
  const result = raw[method](...args);
  if (result !== -1 && result !== false) return result;
  const rawArg = toRaw(args[0]);
  if (rawArg === args[0]) return result;
  args[0] = rawArg;
  return raw[method](...args);
}

/** Runs a mutator untracked, so that two effects pushing to one array do not trigger each other. */
function mutate(self: unknown[], method: string, args: unknown[]): unknown {
  const prevSub = setActiveSub(undefined);
  startBatch();
  try {
    return (toRaw(self) as AnyArray)[method].apply(self, args);
  } finally {
    // An effect that the batch flushes may throw: the caller must still get its subscriber back.
    try {
      endBatch();
    } finally {
      setActiveSub(prevSub);
    }
  }
}

const wrapItem = (item: unknown, wrap: Wrap): unknown => wrap(item);
const wrapItems = (items: unknown[], wrap: Wrap): unknown[] => items.map(wrap);

/**
 * The array methods of mutable proxies. They track `ARRAY_ITERATE_KEY` instead of every index,
 * search the raw array, and run the length-changing mutators untracked in one batch. `wrapperFor`
 * returns the wrap of the proxy a method was called on, which may be a readonly proxy over the
 * mutable one.
 */
export function createArrayInstrumentations(
  wrapperFor: (array: unknown[]) => Wrap,
): Record<PropertyKey, unknown> {
  /** Runs a native method that reads every item, passing wrapped items and the proxy to `fn`. */
  function apply(
    self: unknown[],
    method: string,
    args: unknown[],
    wrapResult?: (result: any, wrap: Wrap) => unknown,
  ): unknown {
    const raw = shallowReadArray(self) as AnyArray;
    const wrap = wrapperFor(self);
    const methodFn = raw[method];
    // A subclass method may take other arguments: call it on the proxy as written.
    if (methodFn !== arrayProto[method]) return wrap(methodFn.apply(self, args));
    const [fn, thisArg] = args as [Callback, unknown];
    const result = methodFn.call(
      raw,
      function (this: unknown, item: unknown, index: number) {
        return fn.call(this, wrap(item), index, self);
      },
      thisArg,
    );
    return wrapResult ? wrapResult(result, wrap) : result;
  }

  function reduce(self: unknown[], method: string, fn: Callback, args: unknown[]): unknown {
    const raw = shallowReadArray(self) as AnyArray;
    const wrap = wrapperFor(self);
    // Without an initial value, the first item is the first accumulator.
    let wrapAccumulator = args.length === 0;
    const result = raw[method](
      function (this: unknown, acc: unknown, item: unknown, index: number) {
        if (wrapAccumulator) {
          wrapAccumulator = false;
          acc = wrap(acc);
        }
        return fn.call(this, acc, wrap(item), index, self);
      },
      ...args,
    );
    return wrapAccumulator ? wrap(result) : result;
  }

  function iterate(
    self: unknown[],
    method: PropertyKey,
    wrapValue: (value: any, wrap: Wrap) => unknown,
  ) {
    const iterator = (shallowReadArray(self) as AnyArray)[method]() as Iterator<unknown>;
    const wrap = wrapperFor(self);
    // A wrapper that inherits the iterator: an own `next` on a native array iterator would slow
    // down array iteration everywhere.
    const wrapped = Object.create(iterator) as Iterator<unknown>;
    wrapped.next = () => {
      const result = iterator.next();
      if (!result.done) result.value = wrapValue(result.value, wrap);
      return result;
    };
    return wrapped;
  }

  const read = (self: unknown[]): AnyArray => reactiveReadArray(self, wrapperFor(self)) as AnyArray;

  const methods: Record<PropertyKey, unknown> = {
    __proto__: null,
    [Symbol.iterator](this: unknown[]) {
      return iterate(this, Symbol.iterator, wrapItem);
    },
    concat(this: unknown[], ...args: unknown[]) {
      return read(this).concat(...args.map((x) => (Array.isArray(x) ? read(x) : x)));
    },
    entries(this: unknown[]) {
      return iterate(this, 'entries', (entry: [number, unknown], wrap) => {
        entry[1] = wrap(entry[1]);
        return entry;
      });
    },
    filter(this: unknown[], ...args: unknown[]) {
      return apply(this, 'filter', args, wrapItems);
    },
    find(this: unknown[], ...args: unknown[]) {
      return apply(this, 'find', args, wrapItem);
    },
    findLast(this: unknown[], ...args: unknown[]) {
      return apply(this, 'findLast', args, wrapItem);
    },
    join(this: unknown[], separator?: string) {
      return read(this).join(separator);
    },
    reduce(this: unknown[], fn: Callback, ...args: unknown[]) {
      return reduce(this, 'reduce', fn, args);
    },
    reduceRight(this: unknown[], fn: Callback, ...args: unknown[]) {
      return reduce(this, 'reduceRight', fn, args);
    },
    toReversed(this: unknown[]) {
      return read(this).toReversed();
    },
    toSorted(this: unknown[], compare?: (a: unknown, b: unknown) => number) {
      return read(this).toSorted(compare);
    },
    toSpliced(this: unknown[], ...args: unknown[]) {
      return read(this).toSpliced(...args);
    },
    values(this: unknown[]) {
      return iterate(this, 'values', wrapItem);
    },
  };
  // The methods that only forward their arguments, by the helper they forward to.
  const forward = (
    names: string,
    run: (self: unknown[], method: string, args: unknown[]) => unknown,
  ): void => {
    for (const name of names.split(',')) {
      methods[name] = function (this: unknown[], ...args: unknown[]) {
        return run(this, name, args);
      };
    }
  };
  forward('every,findIndex,findLastIndex,forEach,map,some', apply);
  forward('includes,indexOf,lastIndexOf', search);
  forward('pop,push,shift,splice,unshift', mutate);
  return methods;
}
