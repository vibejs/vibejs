declare const tokenType: unique symbol;

/** A typed key for a dependency that is not a class. Tokens are compared by identity. */
export interface InjectionToken<T> {
  readonly description: string;
  /** Type-only: carries `T`, never set at runtime. */
  readonly [tokenType]?: T;
}

/** Any class, abstract classes included. */
export type Class<T = object> = abstract new (...args: never[]) => T;

/** A class or an `InjectionToken`; there are no string tokens. */
export type Token<T> = Class<T> | InjectionToken<T>;

/** Creates a frozen token. Two tokens with the same description are different keys. */
export function token<T>(description: string): InjectionToken<T> {
  return Object.freeze({ description });
}

/** The name of a token in messages. */
export function tokenName(key: Token<unknown>): string {
  return typeof key === 'function' ? key.name || '<anonymous class>' : key.description;
}
