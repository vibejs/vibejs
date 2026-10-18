/** Change detection of every reactive value: `NaN` equals itself, `+0` and `-0` differ. */
export const hasChanged = (value: unknown, oldValue: unknown): boolean =>
  !Object.is(value, oldValue);

export const isFunction = (value: unknown): value is () => unknown => typeof value === 'function';

export const isObject = (value: unknown): value is Record<PropertyKey, unknown> =>
  typeof value === 'object' && value !== null;
