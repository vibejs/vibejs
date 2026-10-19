import { parseArgs } from 'node:util';
import type { VibeError } from '@vibejs-org/errors';
import type { CommandDef, OptionDef } from './command.ts';
import { check } from './commands/check.ts';
import { docs } from './commands/docs.ts';
import { explain } from './commands/explain.ts';
import type { Ctx } from './ctx.ts';
import { vibeError } from './errors.gen.ts';
import {
  envelopeError,
  errorText,
  exitCode,
  type CheckResult,
  type CommandHelp,
  type HelpResult,
  type JsonEnvelope,
  type MissingInput,
} from './output.ts';

export const COMMANDS: readonly CommandDef[] = [explain, docs, check];

/** Common wrong commands and what to run instead: a `vibejs` command or the `npm create` line. */
export const MISTAKES: Readonly<Record<string, string>> = {
  create: 'npm create vibejs@latest',
  typecheck: 'vibejs check --only types',
  lint: 'vibejs check --only lint',
  format: 'vibejs check --only format',
  test: 'vibejs check --only test',
};

const GLOBAL_OPTIONS: Record<string, OptionDef> = {
  json: { type: 'boolean', description: 'Print one JSON object (on by default in agent mode).' },
  help: { type: 'boolean', short: 'h', description: 'Describe the commands and their options.' },
  version: { type: 'boolean', description: 'Print the vibejs version.' },
};

const describe = (options: Record<string, OptionDef>): CommandHelp['options'] =>
  Object.entries(options).map(([name, { type, short, multiple, description }]) => ({
    name,
    type,
    short,
    multiple,
    description,
  }));

function help(ctx: Ctx, defs: readonly CommandDef[]): HelpResult {
  return {
    ok: true,
    command: 'help',
    version: ctx.version,
    globalOptions: describe(GLOBAL_OPTIONS),
    commands: defs.map((def) => ({
      name: def.name,
      aliases: def.aliases ?? [],
      summary: def.summary,
      usage: def.usage,
      examples: def.examples,
      options: describe(def.options),
      positionals: def.positionals.map(({ name, required, values }) => ({
        name,
        required,
        values,
      })),
    })),
  };
}

const optionText = (o: CommandHelp['options'][number]) =>
  `  ${o.short ? `-${o.short}, ` : ''}--${o.name}  ${o.description}`;

function helpText(r: HelpResult): string {
  const lines = [`vibejs ${r.version}`, ''];
  for (const def of r.commands) {
    lines.push(def.usage, `  ${def.summary}`, ...def.examples.map((e) => `  $ ${e}`));
    lines.push(...def.options.map(optionText), '');
  }
  lines.push('Global options:', ...r.globalOptions.map(optionText));
  return lines.join('\n');
}

type Outcome = [result: JsonEnvelope, human?: () => string];

function fail(
  command: string,
  ctx: Ctx,
  e: VibeError,
  next: string,
  missing?: MissingInput[],
): Outcome {
  const error = envelopeError(e, missing);
  return [{ ok: false, command, version: ctx.version, next: [next], error }];
}

async function dispatch(argv: string[], ctx: Ctx): Promise<Outcome> {
  const at = argv.findIndex((arg) => !arg.startsWith('-'));
  let def: CommandDef | undefined;
  if (at !== -1) {
    const name = argv[at];
    def = COMMANDS.find((c) => c.name === name || c.aliases?.includes(name));
    if (!def) {
      const next = Object.hasOwn(MISTAKES, name) ? MISTAKES[name] : 'vibejs --help';
      return fail(name, ctx, vibeError('VIBE8004', { name }), next);
    }
  }

  const helpLine = def ? `vibejs ${def.name} --help` : 'vibejs --help';
  let parsed;
  try {
    parsed = parseArgs({
      args: def ? argv.toSpliced(at, 1) : argv,
      options: { ...GLOBAL_OPTIONS, ...def?.options },
      strict: true,
      allowPositionals: true,
    });
  } catch (error) {
    // Every parseArgs error quotes the offending option.
    const option = /'(.+?)'/.exec(String(error))![1];
    return fail(def?.name ?? 'help', ctx, vibeError('VIBE8004', { name: option }), helpLine);
  }
  const { values, positionals } = parsed;
  // An argument beyond the declared positionals is an input error, not silently dropped.
  const declared = def?.positionals ?? [];
  const extra = declared.at(-1)?.variadic ? undefined : positionals[declared.length];
  if (extra !== undefined) {
    return fail(def?.name ?? 'help', ctx, vibeError('VIBE8004', { name: extra }), helpLine);
  }

  if (values.help || (!def && !values.version)) {
    const r = help(ctx, def ? [def] : COMMANDS);
    return [r, () => helpText(r)];
  }
  if (values.version || !def) {
    return [{ ok: true, command: 'version', version: ctx.version }, () => `vibejs ${ctx.version}`];
  }
  const missing = def.positionals.find((p, i) => p.required && i >= positionals.length);
  if (missing) {
    const e = vibeError('VIBE8003', { name: missing.name, command: def.name });
    const input = { name: missing.name, values: missing.values, example: missing.example };
    return fail(def.name, ctx, e, missing.example, [input]);
  }
  const r = await def.run({ values, positionals }, ctx);
  return [r, () => def.human(r)];
}

/**
 * Whether the caller asked for JSON: a `--json` token before `--`. `--json=<value>` counts too, so
 * the VIBE8004 it causes is printed as JSON. Strict parseArgs never reads `--json` as a value.
 */
function wantsJson(argv: string[]): boolean {
  const end = argv.indexOf('--');
  return argv.slice(0, end === -1 ? undefined : end).some((a) => /^--json(=|$)/.test(a));
}

/** Runs one command; JSON with `--json` or in agent mode, text for people otherwise. */
export async function main(argv: string[], ctx: Ctx): Promise<0 | 1 | 2> {
  const [result, human] = await dispatch(argv, ctx);
  if (wantsJson(argv) || ctx.agent.active) ctx.out(`${JSON.stringify(result)}\n`);
  else {
    // A failure without an error (a check with diagnostics) is a result for people too, and so are
    // the diagnostics of a check with an error (a crashed tool), which then follows on stderr.
    const diagnostics = (result as Partial<CheckResult>).diagnostics?.length;
    if (result.ok || !result.error || diagnostics) ctx.out(`${human!()}\n`);
    if (result.error) ctx.err(`${errorText(result)}\n`);
  }
  return exitCode(result);
}
