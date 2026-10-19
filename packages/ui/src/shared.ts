/** Change detection of every reactive value: `NaN` equals itself, `+0` and `-0` differ. */
export const hasChanged = (value: unknown, oldValue: unknown): boolean =>
  !Object.is(value, oldValue);

export const isFunction = (value: unknown): value is () => unknown => typeof value === 'function';

export const isObject = (value: unknown): value is Record<PropertyKey, unknown> =>
  typeof value === 'object' && value !== null;

/** Whether `key` is a canonical array index such as `'0'` (not `'-1'`, `'01'` or `'NaN'`). */
export const isIntegerKey = (key: unknown): boolean =>
  typeof key === 'string' &&
  key !== 'NaN' &&
  key[0] !== '-' &&
  String(Number.parseInt(key, 10)) === key;

/** `marginRight` → `margin-right`, `ArrowLeft` → `arrow-left`. */
export const hyphenate = (value: string): string =>
  value.replaceAll(/\B([A-Z])/g, '-$1').toLowerCase();

/** `foo-bar` → `fooBar`. */
export const camelize = (value: string): string =>
  value.replaceAll(/-(\w)/g, (_, c: string) => c.toUpperCase());

/** `foo` → `Foo`. */
export const capitalize = (value: string): string => value.charAt(0).toUpperCase() + value.slice(1);

/** `'1.5'` → `1.5`; a string that does not start with a number stays as it is. */
export function looseToNumber(value: string): unknown {
  const n = Number.parseFloat(value);
  return Number.isNaN(n) ? value : n;
}

/** The string the DOM would make of `value`. */
export const toText = (value: unknown): string => String(value);
