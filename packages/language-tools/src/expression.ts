import { forEachIdentifier } from '@vibejs-org/compiler';
import { Preset, type CodeBuilder } from './builder.ts';

/** The names a template reads from outside, and the ones it used. */
export interface Names {
  /** Setup bindings, which the template block shadows: name -> declaration. */
  setup: ReadonlyMap<string, [number, number]>;
  /** Props without a setup binding and `$attrs`, `$slots`, `$emit`, `$props`: name -> declaration. */
  ctx: ReadonlyMap<string, [number, number] | null>;
  usedSetup: Set<string>;
  usedCtx: Set<string>;
  /** Whether the template writes to a setup binding. */
  writes: boolean;
}

/**
 * Emits the template expression at the original range [start, end), verbatim. Names bound to setup
 * bindings or props get BOUND spans; write roots among them are written through `__vibe_w` (setup)
 * or `__vibe_ctx` (props), so readonly targets fail at the template. `locals` are template-local
 * names (v-for aliases, `$event`). An expression that does not parse is emitted as it is.
 */
export function expression(
  b: CodeBuilder,
  names: Names,
  source: string,
  [start, end]: [number, number],
  locals: ReadonlySet<string>,
): void {
  let at = start;
  forEachIdentifier(source.slice(start, end), start, (name, from, to, { local, writeRoot }) => {
    if (local || locals.has(name)) return;
    const setup = names.setup.has(name);
    if (!setup && !names.ctx.has(name)) return;
    (setup ? names.usedSetup : names.usedCtx).add(name);
    b.verbatim(at, from, Preset.EXPR);
    if (writeRoot) {
      b.add(setup ? '__vibe_w.' : '__vibe_ctx.');
      names.writes ||= setup;
    }
    b.verbatim(from, to, Preset.BOUND);
    at = to;
  });
  b.verbatim(at, end, Preset.EXPR);
}

/** The names that a v-for alias (`item`, `{ id, name }`, `[a, b]`) declares. */
export function aliasNames(source: string, [start, end]: [number, number]): string[] {
  const names: string[] = [];
  // As an assignment target, every name the pattern declares is a write root.
  forEachIdentifier(`[${source.slice(start, end)}] = []`, start - 1, (name, _, __, info) => {
    if (info.writeRoot) names.push(name);
  });
  return names;
}
