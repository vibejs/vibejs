#!/usr/bin/env node
// create-vibejs [dir] [--pm pnpm|npm|yarn|bun] [--no-install]: writes a new full-stack vibe.js
// project from templates/fullstack and the agent files of @vibejs-org/cli, then installs it.
// Zero dependencies: the Node standard library only.
import { spawn } from 'node:child_process';
import {
  cpSync,
  existsSync,
  readdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  writeFileSync,
} from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

/** @typedef {'pnpm' | 'npm' | 'yarn' | 'bun'} PackageManager */

/**
 * @typedef {object} Ctx
 * @property {string} cwd
 * @property {Record<string, string | undefined>} env
 * @property {boolean} isTTY Whether stdout is a terminal.
 * @property {(s: string) => void} stdout
 * @property {(s: string) => void} stderr
 * @property {(question: string) => Promise<string>} prompt
 * @property {(command: string, cwd: string) => Promise<{ ok: boolean; output: string }>} exec
 *   Runs a shell command and captures its output.
 * @property {string} templateDir
 * @property {string} agentsDir
 * @property {string} version
 */

export const DOCS_BASE = 'https://vibejs.org/v0/errors/';
const EXAMPLE = 'npm create vibejs@latest my-app';
const DEFAULT_DIR = 'vibejs-app';

/** @type {readonly PackageManager[]} */
const MANAGERS = ['pnpm', 'npm', 'yarn', 'bun'];

/**
 * How a project runs its local CLI: the `execPrefix` table of @vibejs-org/cli.
 * @type {Record<PackageManager, string>}
 */
export const EXEC = {
  pnpm: 'pnpm exec vibejs',
  npm: 'npx --no vibejs',
  yarn: 'yarn vibejs',
  bun: 'npx --no vibejs',
};

/**
 * The entries of messages/create.md (message and fixes, with `{name}` placeholders) and exit codes.
 * @type {Record<string, [message: string, fixes: string[], exit: 1 | 2]>}
 */
export const MESSAGES = {
  VIBE8101: [
    '`{dir}` is not empty; create-vibejs writes a new project only into an empty or missing directory.',
    [
      'Pass the name of a new directory, as in `npm create vibejs@latest my-app`.',
      'Empty `{dir}` first if it holds nothing you need.',
    ],
    2,
  ],
  VIBE8102: ['`{name}` is not a valid npm package name.', ['Use a name such as `my-app`.'], 2],
  VIBE8103: [
    '`{command}` failed in `{dir}`; the project files are kept.',
    ['Run `{command}` in `{dir}` again.'],
    1,
  ],
  VIBE8104: [
    '{problem}. Usage: create-vibejs [dir] [--pm pnpm|npm|yarn|bun] [--no-install]',
    ['Run `npm create vibejs@latest my-app`.'],
    2,
  ],
};

/** An unscoped npm package name. */
const NAME = /^[a-z0-9~-][a-z0-9._~-]*$/;

/** @param {string} text @param {Record<string, string>} args */
const fill = (text, args) => text.replace(/\{(\w+)\}/g, (_, key) => args[key]);

/**
 * Agent mode (`VIBEJS_AGENT=1` or stdout not a terminal) prints one JSON object and never prompts.
 * @param {string[]} argv
 * @param {Ctx} ctx
 * @returns {Promise<0 | 1 | 2>}
 */
export async function main(argv, ctx) {
  const agent = ctx.env.VIBEJS_AGENT === '1' || !ctx.isTTY;
  const base = { ok: true, command: 'create', version: ctx.version };

  /**
   * @param {string} code
   * @param {Record<string, string>} args
   * @param {{ next?: string[]; missing?: { name: string; example: string }[] }} [extra]
   * @returns {1 | 2}
   */
  const fail = (code, args, extra = {}) => {
    const [message, fixes, exit] = MESSAGES[code];
    const error = {
      code,
      message: fill(message, args),
      docs: `${DOCS_BASE}${code}`,
      fixes: fixes.map((fix) => fill(fix, args)),
      missing: extra.missing,
    };
    if (agent) {
      ctx.stdout(`${JSON.stringify({ ...base, ok: false, next: extra.next, error })}\n`);
    } else {
      const fixLines = error.fixes.map((fix) => `  Fix: ${fix}`);
      ctx.stderr(
        `${[`[${code}] ${error.message}`, ...fixLines, `  Docs: ${error.docs}`].join('\n')}\n`,
      );
    }
    return exit;
  };

  let values, positionals;
  try {
    ({ values, positionals } = parseArgs({
      args: argv,
      options: { pm: { type: 'string' }, install: { type: 'boolean', default: true } },
      allowPositionals: true,
      allowNegative: true,
    }));
  } catch (error) {
    // Every parseArgs error quotes the offending option.
    return fail('VIBE8104', { problem: `Invalid option ${/'.+?'/.exec(String(error))?.[0]}` });
  }
  if (positionals.length > 1) {
    return fail('VIBE8104', { problem: `Unexpected argument \`${positionals[1]}\`` });
  }
  const fromAgent = ctx.env.npm_config_user_agent?.split('/', 1)[0];
  const wanted = values.pm ?? MANAGERS.find((m) => m === fromAgent) ?? 'npm';
  const pm = MANAGERS.find((m) => m === wanted);
  if (!pm) {
    return fail('VIBE8104', { problem: `\`--pm ${wanted}\` is not one of ${MANAGERS.join(', ')}` });
  }

  let dir = positionals.at(0);
  if (dir === undefined) {
    if (agent) {
      const missing = [{ name: 'dir', example: EXAMPLE }];
      return fail('VIBE8104', { problem: 'Missing the project directory' }, { missing });
    }
    dir = (await ctx.prompt(`Project directory (${DEFAULT_DIR}): `)).trim() || DEFAULT_DIR;
  }
  const target = resolve(ctx.cwd, dir);
  const name = basename(target);
  if (!NAME.test(name) || name.length > 214) return fail('VIBE8102', { name });
  if (existsSync(target) && readdirSync(target).length) return fail('VIBE8101', { dir });

  cpSync(ctx.templateDir, target, { recursive: true });
  renameSync(join(target, '_gitignore'), join(target, '.gitignore'));
  const manifest = join(target, 'package.json');
  writeFileSync(
    manifest,
    readFileSync(manifest, 'utf8')
      .replaceAll('0.0.0-template', `^${ctx.version}`)
      .replace('"name": "vibejs-app"', `"name": ${JSON.stringify(name)}`),
  );
  for (const file of ['AGENTS.md', 'CLAUDE.md']) {
    const text = readFileSync(join(ctx.agentsDir, file), 'utf8');
    writeFileSync(join(target, file), text.replaceAll('{{exec}}', EXEC[pm]));
  }

  const install = `${pm} install`;
  const run = [`${pm} run dev`, `${pm} run check`];
  const next = [`cd ${dir}`, ...(values.install ? run : [install, ...run])];
  if (values.install) {
    if (!agent) ctx.stdout(`Installing the dependencies with ${pm}...\n`);
    const r = await ctx.exec(install, target);
    if (!r.ok) {
      ctx.stderr(r.output);
      return fail('VIBE8103', { command: install, dir }, { next: [`cd ${dir}`, install] });
    }
    if (!agent) ctx.stdout(r.output);
  }
  if (agent) {
    ctx.stdout(`${JSON.stringify({ ...base, next, dir, pm, installed: values.install })}\n`);
  } else {
    ctx.stdout(`Created ${dir}. Next:\n${next.map((step) => `  ${step}`).join('\n')}\n`);
  }
  return 0;
}

/**
 * The context of a real run.
 * @param {{ cwd(): string; env: Record<string, string | undefined>; stdin: NodeJS.ReadableStream; stdout: NodeJS.WritableStream & { isTTY?: boolean }; stderr: NodeJS.WritableStream }} proc
 * @returns {Ctx}
 */
export function nodeCtx(proc = process) {
  return {
    cwd: proc.cwd(),
    env: proc.env,
    isTTY: proc.stdout.isTTY === true,
    stdout: (s) => proc.stdout.write(s),
    stderr: (s) => proc.stderr.write(s),
    async prompt(question) {
      const rl = createInterface({ input: proc.stdin, output: proc.stdout });
      try {
        return await rl.question(question);
      } finally {
        rl.close();
      }
    },
    exec: (command, cwd) =>
      new Promise((done) => {
        // A shell finds npm.cmd and the other Windows shims; the command is fixed text.
        const child = spawn(command, { cwd, shell: true });
        let output = '';
        child.stdout.on('data', (chunk) => (output += chunk));
        child.stderr.on('data', (chunk) => (output += chunk));
        child.on('close', (code) => done({ ok: code === 0, output }));
      }),
    templateDir: fileURLToPath(new URL('templates/fullstack', import.meta.url)),
    agentsDir: fileURLToPath(new URL('agents', import.meta.url)),
    version: JSON.parse(readFileSync(new URL('package.json', import.meta.url), 'utf8')).version,
  };
}

// The real path: npm runs a bin through a symlink in node_modules/.bin.
if (realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await main(process.argv.slice(2), nodeCtx());
}
