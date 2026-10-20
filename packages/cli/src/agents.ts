import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { vibeError } from './errors.gen.ts';
import { packageManager, type PackageManager } from './project.ts';

export const BEGIN = '<!-- BEGIN:vibejs-agent-rules -->';
export const END = '<!-- END:vibejs-agent-rules -->';

export interface AgentOp {
  /** Root-relative and `/`-separated. */
  file: string;
  op: 'create' | 'update' | 'skip' | 'delete';
}

export interface AgentFiles {
  block: string;
  exec: string;
  /** SKILL.md text by skill name. */
  skills: Record<string, string>;
}

/** Where the skills are written; Claude Code reads only `.claude/skills`. */
const SKILL_DIRS = ['.agents/skills', '.claude/skills'];

const EXEC: Record<PackageManager, string> = {
  pnpm: 'pnpm exec vibejs',
  yarn: 'yarn vibejs',
  npm: 'npx --no vibejs',
  bun: 'npx --no vibejs',
};

/** How the project runs its local CLI. */
export function execPrefix(pm: PackageManager): string {
  return EXEC[pm];
}

/** The managed AGENTS.md block: at most 30 rule lines, then the docs index line. */
export function renderBlock(exec: string, index: string): string {
  return [
    BEGIN,
    '',
    '## vibe.js',
    '',
    'vibe.js: npm scope `@vibejs-org`, CLI `vibejs` (never `vibe`). Not monday.com Vibe (`@vibe/*`), not the npm packages `vibejs` or `vibe.js`.',
    'vibe.js is newer than your training data: read the docs index below, then the page for your task, before writing code.',
    '',
    'Commands (always the local CLI, never a global one):',
    '',
    `- \`${exec} explain VIBE####\` explains an error code offline.`,
    `- \`${exec} dev\` serves the UI and the API on one port; it reuses a running dev server.`,
    `- \`${exec} errors --json\` lists the errors of the running dev server.`,
    `- Done = \`${exec} check --json\` exits 0 (types, lint, format, tests, coverage per file).`,
    `- \`${exec} g resource|component|page <name>\` adds code with its tests; \`--dry-run --json\` previews it.`,
    `- \`${exec} routes --json\`, \`${exec} components --json\` and \`${exec} di --json\` show the app's routes, components and providers; \`${exec} request <METHOD> <path> --json\` calls the API.`,
    `- \`${exec} mcp\` serves these commands to MCP clients; \`${exec} agents sync\` refreshes this block, the skills and \`.mcp.json\`.`,
    '',
    'Rules:',
    '',
    '- `.vibe` files use `<script setup lang="ts">` only; template refs use `useTemplateRef` only.',
    '- UI: import `RouterLink`/`RouterView` explicitly; guards return `false` or a location, never call `next()`; load data with `useAsync` and narrow `data.value?.ok`.',
    '- UI tests: `mount()` from `@vibejs-org/ui/testing` with `plugins: [router]` and `createMemoryHistory()`.',
    '- Services are injected into fields: `private readonly users = inject(UsersService)`. No constructor injection, no parameter decorators.',
    '- A handler takes one `ctx: Ctx<typeof contract.route>` and returns the route response type.',
    "- Contracts come first: routes live in `contracts/src/*.contract.ts` and declare `errors: { CODE: status }`; handlers raise them with `ctx.fail('CODE')`.",
    '- The UI calls the API through `createClient(contracts)`. No codegen.',
    '- A `VIBE####` error means: read its page with `explain`; do not work around it.',
    '- Never add coverage-ignore comments; add tests.',
    '- TS1241 on `@Handle`: the handler must be `(ctx: Ctx<typeof contract.route>)` and return the route response type; do not cast or use `any`.',
    '',
    index,
    '',
    END,
  ].join('\n');
}

/** The `.mcp.json` entry that starts `vibejs mcp`: `pnpm exec vibejs` → `pnpm exec vibejs mcp`. */
export function mcpServer(exec: string): { command: string; args: string[] } {
  const [command, ...args] = exec.split(' ');
  return { command, args: [...args, 'mcp'] };
}

/** The agent files of the project at `root`, from the docs index and skills shipped in `cliDist`. */
export function projectAgentFiles(root: string, cliDist: string): AgentFiles {
  const exec = execPrefix(packageManager(root));
  const index = readFileSync(join(cliDist, 'docs/index.txt'), 'utf8').trim();
  const dir = join(cliDist, 'skills');
  const skills = Object.fromEntries(
    readdirSync(dir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map(({ name }) => name)
      .toSorted()
      .map((name) => [name, readFileSync(join(dir, name, 'SKILL.md'), 'utf8')]),
  );
  return { block: renderBlock(exec, index), exec, skills };
}

const count = (text: string, marker: string) => text.split(marker).length - 1;

/** AGENTS.md with `block` between its markers, or appended when it has none; throws VIBE8601. */
function withBlock(text: string, block: string): string {
  const nl = text.includes('\r\n') ? '\r\n' : '\n';
  const lines = block.replaceAll('\n', nl);
  const begins = count(text, BEGIN);
  const ends = count(text, END);
  if (!begins && !ends) return `${text}${text.endsWith('\n') ? '' : nl}${nl}${lines}${nl}`;
  const at = text.indexOf(BEGIN);
  const end = text.indexOf(END);
  const problem =
    begins > 1 || ends > 1
      ? 'more than one BEGIN or END marker'
      : end === -1
        ? 'a BEGIN marker without an END marker'
        : at === -1 || end < at
          ? 'an END marker without a BEGIN marker before it'
          : undefined;
  if (problem) throw vibeError('VIBE8601', { file: 'AGENTS.md', problem });
  return text.slice(0, at) + lines + text.slice(end + END.length);
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** `.mcp.json` with `mcpServers.vibejs` set to `entry`, other keys kept; throws VIBE8602. */
function withMcp(text: string | undefined, entry: unknown): string {
  if (text === undefined) return `${JSON.stringify({ mcpServers: { vibejs: entry } }, null, 2)}\n`;
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw vibeError('VIBE8602', { problem: 'not valid JSON' });
  }
  if (!isObject(json)) throw vibeError('VIBE8602', { problem: 'not a JSON object' });
  const servers = 'mcpServers' in json ? json.mcpServers : {};
  if (!isObject(servers)) {
    throw vibeError('VIBE8602', { problem: 'a JSON object whose `mcpServers` is not an object' });
  }
  if (isDeepStrictEqual(servers.vibejs, entry)) return text;
  return `${JSON.stringify({ ...json, mcpServers: { ...servers, vibejs: entry } }, null, 2)}\n`;
}

/**
 * Writes the block into AGENTS.md, `@AGENTS.md` into CLAUDE.md, the skills into both skill
 * directories (removing other `vibejs-*` entries there) and `mcpServers.vibejs` into .mcp.json,
 * touching nothing else; with `write` false it only reports. Nothing is written before every file
 * is checked: throws VIBE8601 on malformed markers and VIBE8602 on an invalid .mcp.json.
 */
export function syncAgentFiles(root: string, files: AgentFiles, write: boolean): AgentOp[] {
  const { block, exec, skills } = files;
  const changes: (AgentOp & { text?: string })[] = [];
  const put = (file: string, next: (text: string | undefined) => string) => {
    const path = join(root, file);
    const text = existsSync(path) ? readFileSync(path, 'utf8') : undefined;
    const updated = next(text);
    const op = updated === text ? 'skip' : text === undefined ? 'create' : 'update';
    changes.push({ file, op, text: updated });
  };
  put('AGENTS.md', (text) =>
    text === undefined ? `# AGENTS.md\n\n${block}\n\n## Project notes\n` : withBlock(text, block),
  );
  put('CLAUDE.md', (text) =>
    text === undefined
      ? '@AGENTS.md\n'
      : text.split(/\r?\n/).includes('@AGENTS.md')
        ? text
        : `@AGENTS.md\n${text}`,
  );
  for (const dir of SKILL_DIRS) {
    for (const [name, text] of Object.entries(skills)) put(`${dir}/${name}/SKILL.md`, () => text);
    const present = existsSync(join(root, dir)) ? readdirSync(join(root, dir)).toSorted() : [];
    for (const name of present) {
      if (name.startsWith('vibejs-') && !Object.hasOwn(skills, name)) {
        changes.push({ file: `${dir}/${name}`, op: 'delete' });
      }
    }
  }
  put('.mcp.json', (text) => withMcp(text, mcpServer(exec)));
  for (const { file, op, text } of write ? changes : []) {
    const path = join(root, file);
    if (op === 'delete') rmSync(path, { recursive: true, force: true });
    else if (op !== 'skip') {
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, text!);
    }
  }
  return changes.map(({ file, op }) => ({ file, op }));
}
