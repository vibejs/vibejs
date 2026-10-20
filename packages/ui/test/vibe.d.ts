// A `.vibe` module compiled by vibe(), for the `*.vibe.test.ts` files: a component definition
// without a typed signature.
declare module '*.vibe' {
  import type { Component, Handle } from '@vibejs-org/ui';

  // oxlint-disable-next-line typescript/no-explicit-any -- the signature is not checked here
  const component: Component<(props: any) => Handle<any, any, any>>;
  export default component;
}
