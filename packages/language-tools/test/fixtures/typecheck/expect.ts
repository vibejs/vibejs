type Equal<A, B> = (<X>() => X extends A ? 1 : 2) extends <X>() => X extends B ? 1 : 2 ? true : false;

/** `expectType<T>()(value)` compiles only when the type of `value` is exactly `T`. */
export function expectType<T>() {
  return <U>(value: U & (Equal<T, U> extends true ? unknown : never)): void => void value;
}
