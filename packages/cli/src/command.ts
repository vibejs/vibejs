import type { ParseArgsOptionDescriptor } from 'node:util';
import type { Ctx } from './ctx.ts';
import type { JsonEnvelope } from './output.ts';

export interface OptionDef extends ParseArgsOptionDescriptor {
  description: string;
}

export interface CommandDef<R extends JsonEnvelope = JsonEnvelope> {
  name: string;
  aliases?: string[];
  summary: string;
  usage: string;
  examples: string[];
  options: Record<string, OptionDef>;
  /** Only the last positional can be `variadic`; it takes every remaining argument. */
  positionals: {
    name: string;
    required: boolean;
    variadic?: boolean;
    values?: string[];
    example: string;
  }[];
  /** Pure: no output, no exit. Failures are envelopes with `ok: false`. */
  run(
    input: {
      values: Record<string, string | boolean | (string | boolean)[] | undefined>;
      positionals: string[];
    },
    ctx: Ctx,
  ): Promise<R>;
  /** The text for people; called only when `r.ok`. */
  human(r: R): string;
}
