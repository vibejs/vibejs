// A fake typed client, provided under `API`: each call takes `{ signal }`, never rejects, and
// waits for the test to settle it.
import type { InjectionKey } from '@vibejs-org/ui';

interface User {
  id: number;
  name: string;
}
type UserResult =
  | { ok: true; status: 200; data: User }
  | { ok: false; status: 404; error: { message: string } };

export interface Call {
  id: number;
  signal: AbortSignal;
  respond(result: UserResult): void;
}

/** The calls in order, each settled by the test with `respond()`. */
export const calls: Call[] = [];

export const api = {
  users: {
    one(input: { params: { id: number } }, options: { signal: AbortSignal }): Promise<UserResult> {
      return new Promise((respond) => {
        calls.push({ id: input.params.id, signal: options.signal, respond });
      });
    },
  },
};

export const API: InjectionKey<typeof api> = Symbol('api');
