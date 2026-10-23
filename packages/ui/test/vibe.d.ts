// A `.vibe` module compiled by vibe(), for the `*.vibe.test.ts` files: a component without a typed
// signature. It is typed as a public `Component`, not as `ComponentDef` from
// `@usevibejs/ui/internal`, because `mount<C extends Component<any>>` does not accept a
// `ComponentDef`. As a result, the props these tests pass to `mount()` are not type-checked.
declare module '*.vibe' {
  import type { Component, Handle } from '@usevibejs/ui';

  // oxlint-disable-next-line typescript/no-explicit-any -- the signature is not checked here
  const component: Component<(props: any) => Handle<any, any, any>>;
  export default component;
}
