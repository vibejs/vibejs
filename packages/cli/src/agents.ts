import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { vibeError } from './errors.gen.ts';
import { packageManager, type PackageManager } from './project.ts';

export const BEGIN = '<!-- BEGIN:vibejs-agent-rules -->';
export const END = '<!-- END:vibejs-agent-rules -->';

export interface AgentOp {
  file: 'AGENTS.md' | 'CLAUDE.md';
  op: 'create' | 'update' | 'skip';
}

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
    `- \`${exec} agents sync\` refreshes this block.`,
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

/** The block for the project at `root`, with the docs index of the CLI in `docsDir`. */
export function projectBlock(root: string, docsDir: string): string {
  const index = readFileSync(join(docsDir, 'index.txt'), 'utf8').trim();
  return renderBlock(execPrefix(packageManager(root)), index);
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

/**
 * Writes the block into AGENTS.md and `@AGENTS.md` into CLAUDE.md, touching nothing else; with
 * `write` false it only reports what it would do. Throws VIBE8601 on malformed markers.
 */
export function syncAgentFiles(root: string, block: string, write: boolean): AgentOp[] {
  const plan: [AgentOp['file'], (text: string | undefined) => string][] = [
    [
      'AGENTS.md',
      (text) =>
        text === undefined
          ? `# AGENTS.md\n\n${block}\n\n## Project notes\n`
          : withBlock(text, block),
    ],
    [
      'CLAUDE.md',
      (text) =>
        text === undefined
          ? '@AGENTS.md\n'
          : text.split(/\r?\n/).includes('@AGENTS.md')
            ? text
            : `@AGENTS.md\n${text}`,
    ],
  ];
  return plan.map(([file, next]) => {
    const path = join(root, file);
    const text = existsSync(path) ? readFileSync(path, 'utf8') : undefined;
    const updated = next(text);
    if (updated === text) return { file, op: 'skip' };
    if (write) writeFileSync(path, updated);
    return { file, op: text === undefined ? 'create' : 'update' };
  });
}
