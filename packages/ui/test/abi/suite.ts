import { describe } from 'vitest';
import type { ComponentDef } from '@usevibejs/ui/internal';

/**
 * Tests of one component's behavior, run on its hand-written twin (`<Name>.ts`) here and on the
 * compiled `<Name>.vibe` by the compiler's tests.
 */
export interface AbiSuite {
  name: string;
  run(load: () => ComponentDef | Promise<ComponentDef>): void;
}

export function defineAbiSuite(name: string, run: AbiSuite['run']): AbiSuite {
  return {
    name,
    run: (load) => {
      // oxlint-disable-next-line vitest/valid-title -- each suite is titled by its component
      describe(name, () => {
        run(load);
      });
    },
  };
}
