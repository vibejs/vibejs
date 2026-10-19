import type { InjectionKey, Ref } from '@vibejs-org/ui';

/** The theme that Provide.vibe provides to Consumer.vibe. */
export const ThemeKey: InjectionKey<Ref<string>> = Symbol('theme');
