// Usage:
//   node scripts/agent-eval.ts --dry-run
//   node scripts/agent-eval.ts [--agent claude|codex]... [--task <id>]... [--runs <n>=3] [--out <dir>=.planning/evals]
//
// Maintainers only. Measures whether coding agents complete vibe.js tasks in a freshly scaffolded
// app, with the managed agent files (`with`) and without them (`without`). The defaults run both
// agents, every task and 3 runs: 5 tasks x 2 agents x 2 variants x 3 runs = 60 runs.
//
// Cost: every run is a paid, non-interactive agent session of up to 20 minutes. --dry-run starts no
// agent and costs nothing: it builds and packs, then, for each task, checks that the grader fails
// the untouched seed and passes the reference solution, and that a `without` workspace has no agent
// files. It prints the agent commands a real run would execute.
//
// Prerequisites: `claude` and `codex` on the PATH and logged in (not needed for --dry-run).
//
// Isolation: each run gets its own workspace in the OS temp directory, outside any git repository:
// a pnpm app scaffolded from the packed tarballs, with the task's seed, committed once to a new
// local repository. The agents run with their permission checks bypassed inside it. Global
// instruction files (~/.claude/CLAUDE.md, ~/.codex/AGENTS.md) still reach the agents: the script
// warns about them and records them in the results.
//
// Grading, after the agent exits: the task's hidden grader files are copied in, then
// `vibejs check --json` must report ok, the task assertion must hold, and the diff must add no
// ignore or disable comment and must not touch the tool configs. A run passes when all of them hold.
//
// Results: <out>/<YYYY-MM-DD>-<short sha>/results.json holds
// { sha, date, versions, warnings, runs: [{ task, agent, variant, run, pass, reason, ms }] }, and
// each run's directory <task>-<agent>-<variant>-<n>/ holds the agent output (agent.jsonl,
// agent.stderr.txt), diff.patch and check.json. Exit 1 when an agent passes less than 80% of its
// `with` runs (the release gate), otherwise 0.
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import {
  cleanup,
  env,
  installPnpm,
  must,
  pack,
  run,
  scaffold,
  temp,
} from '../packages/create-vibejs/test/scaffold.ts';

/** The agent commands, run in the workspace with the task prompt as the last argument. */
const CLAUDE = [
  'claude',
  '-p',
  '--output-format',
  'stream-json',
  '--verbose',
  '--dangerously-skip-permissions',
];
const CODEX = ['codex', 'exec', '--json', '--dangerously-bypass-approvals-and-sandbox'];
const AGENTS: Record<string, string[]> = { claude: CLAUDE, codex: CODEX };
const TIMEOUT = 20 * 60_000;

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const FIXTURES = join(ROOT, 'packages/create-vibejs/test/fixtures/agent-eval');
/** What `vibejs agents sync` and create write; the `without` variant deletes them. */
const AGENT_FILES = ['AGENTS.md', 'CLAUDE.md', '.mcp.json', '.agents', '.claude'];
const GLOBAL_FILES = ['.claude/CLAUDE.md', '.codex/AGENTS.md'].map((f) => join(homedir(), f));
const FORBIDDEN_LINE =
  /v8 ignore|@ts-ignore|@ts-expect-error|@ts-nocheck|(?:eslint|oxlint)-disable/;
const FORBIDDEN_FILE =
  /(?:^|\/)(?:vitest\.config\.ts|tsconfig[^/]*\.json|\.oxlintrc\.json|\.oxfmtrc\.json)$/;

interface Task {
  /** The fixture directory name. */
  id: string;
  /** Undefined when the task is done, otherwise the failure reason. */
  check(app: string): string | undefined;
  /** Text the dry-run expects in the baseline `check --json` result. */
  baseline?: string;
}

/** The fields read from `--json` results. */
interface Json {
  ok?: boolean;
  api?: { method: string; path: string }[];
  ui?: { path: string; name?: string }[];
  response?: { status: number; body: unknown };
}

/** The last JSON line of a `vibejs ... --json` run in the app. */
function vibejs(app: string, ...args: string[]): Json {
  const { stdout, stderr } = run('pnpm', ['exec', 'vibejs', ...args, '--json'], app);
  const line = stdout.split('\n').findLast((l) => l.startsWith('{'));
  if (!line) throw new Error(`vibejs ${args.join(' ')}: no JSON\n${stdout}\n${stderr}`);
  return JSON.parse(line);
}

const read = (app: string, file: string) =>
  existsSync(join(app, file)) ? readFileSync(join(app, file), 'utf8') : '';

/** Undefined when `GET path` answers `status` (and `test` holds for the body). */
function request(app: string, path: string, status: number, test = (_body: unknown) => true) {
  const { response } = vibejs(app, 'request', 'GET', path);
  return response?.status === status && test(response.body)
    ? undefined
    : `GET ${path}: ${JSON.stringify(response)}`;
}

const TASKS: Task[] = [
  {
    id: 'projects-resource',
    check(app) {
      const { api = [], ui = [] } = vibejs(app, 'routes');
      if (!api.some((r) => r.method === 'GET' && r.path === '/api/projects'))
        return 'no API route GET /api/projects';
      if (!ui.some((r) => r.path === '/projects')) return 'no UI route /projects';
      return request(app, '/api/projects', 200, Array.isArray);
    },
  },
  {
    id: 'route-errors',
    check(app) {
      if (!/UNKNOWN_SERVICE['"]?\s*:\s*404/.test(read(app, 'contracts/src/health.contract.ts')))
        return 'the health contract declares no UNKNOWN_SERVICE: 404';
      return (
        request(app, '/api/health/api', 200) ??
        request(app, '/api/health/db', 200) ??
        request(app, '/api/health/nope', 404, (b) => Object(b).code === 'UNKNOWN_SERVICE')
      );
    },
  },
  {
    // The grader test runs inside `check`.
    id: 'rating-input',
    check: (app) =>
      read(app, 'ui/src/components/RatingInput.vibe') ? undefined : 'no RatingInput.vibe',
  },
  {
    id: 'typed-route',
    check(app) {
      const { ui = [] } = vibejs(app, 'routes');
      if (!ui.some((r) => r.name === 'about' && r.path === '/about'))
        return 'no UI route about at /about';
      if (!/<RouterLink\b[^>]*name:\s*['"]about['"]/.test(read(app, 'ui/src/App.vibe')))
        return "App.vibe has no RouterLink to { name: 'about' }";
      return undefined;
    },
  },
  {
    id: 'fix-provider',
    baseline: 'VIBE9102',
    check(app) {
      if (!read(app, 'server/src/health/health.controller.ts').includes('inject(HealthService)'))
        return 'the controller no longer injects HealthService';
      return request(app, '/api/health', 200);
    },
  },
];

const git = (app: string, ...args: string[]) => must(run('git', args, app));

/** A new app for a task: scaffolded, installed, seeded and committed. */
function workspace(task: Task, variant: string, tarballs: Record<string, string>): string {
  const app = join(temp('vibejs-eval-'), 'app');
  scaffold(app, 'pnpm');
  installPnpm(app, tarballs);
  const seed = join(FIXTURES, task.id, 'seed');
  if (existsSync(seed)) cpSync(seed, app, { recursive: true });
  if (variant === 'without') {
    for (const f of AGENT_FILES) rmSync(join(app, f), { recursive: true, force: true });
  }
  git(app, 'init', '-q');
  git(app, 'add', '-A');
  git(
    app,
    '-c',
    'user.name=agent-eval',
    '-c',
    'user.email=agent-eval@invalid',
    '-c',
    'commit.gpgsign=false',
    'commit',
    '-q',
    '--no-verify',
    '-m',
    'seed',
  );
  return app;
}

interface Grade {
  pass: boolean;
  reason?: string;
  diff: string;
  check: string;
}

/** Grades the app as the agent left it; a grader problem is a failure, never a throw. */
function grade(task: Task, app: string): Grade {
  let diff = '';
  let check = '';
  try {
    git(app, 'add', '-A');
    diff = git(app, 'diff', '--cached');
    const files = git(app, 'diff', '--cached', '--name-only').split('\n');
    const grader = join(FIXTURES, task.id, 'grader');
    if (existsSync(grader)) cpSync(grader, app, { recursive: true });
    const r = run('pnpm', ['exec', 'vibejs', 'check', '--json'], app);
    check = r.stdout.split('\n').findLast((l) => l.startsWith('{')) ?? `${r.stdout}\n${r.stderr}`;
    const fail = (reason: string): Grade => ({ pass: false, reason, diff, check });
    if (!check.startsWith('{') || JSON.parse(check).ok !== true) return fail('check failed');
    const reason = task.check(app);
    if (reason) return fail(reason);
    const lines = diff.split('\n').filter((l) => /^\+(?!\+\+)/.test(l) && FORBIDDEN_LINE.test(l));
    const touched = files.filter((f) => FORBIDDEN_FILE.test(f));
    if (lines.length || touched.length)
      return fail(`forbidden edit: ${[...touched, ...lines].join('; ')}`);
    return { pass: true, diff, check };
  } catch (error) {
    return { pass: false, reason: `grader error: ${String(error)}`, diff, check };
  }
}

const { values } = parseArgs({
  options: {
    'dry-run': { type: 'boolean', default: false },
    agent: { type: 'string', multiple: true, default: Object.keys(AGENTS) },
    task: { type: 'string', multiple: true, default: TASKS.map((t) => t.id) },
    runs: { type: 'string', default: '3' },
    out: { type: 'string', default: join(ROOT, '.planning/evals') },
  },
});
const agents = values.agent;
const selected = TASKS.filter((t) => values.task.includes(t.id));
const runs = Number(values.runs);
const unknown = [
  ...agents.filter((a) => !(a in AGENTS)).map((a) => `unknown agent ${a}`),
  ...values.task.filter((id) => !TASKS.some((t) => t.id === id)).map((id) => `unknown task ${id}`),
  ...(Number.isInteger(runs) && runs > 0
    ? []
    : [`--runs ${values.runs} is not a positive integer`]),
];
if (unknown.length) {
  console.error(`agent-eval: ${unknown.join(', ')}`);
  process.exit(1);
}
/** Each task's dry-run: the baseline fails, the solution passes, `without` has no agent files. */
function dryRun(tarballs: Record<string, string>): string[] {
  const failed: string[] = [];
  for (const task of selected) {
    console.log(`agent-eval: ${task.id}`);
    const app = workspace(task, 'with', tarballs);
    const base = grade(task, app);
    console.log(`  baseline: ${base.pass ? 'pass' : `fail (${base.reason})`}`);
    if (base.pass) failed.push(`${task.id}: the baseline passes`);
    if (task.baseline && !base.check.includes(task.baseline))
      failed.push(`${task.id}: the baseline check.json has no ${task.baseline}`);
    else if (task.baseline) console.log(`  baseline check.json contains ${task.baseline}`);
    cpSync(join(FIXTURES, task.id, 'solution'), app, { recursive: true });
    const solved = grade(task, app);
    console.log(`  solution: ${solved.pass ? 'pass' : `fail (${solved.reason})`}`);
    if (!solved.pass)
      failed.push(`${task.id}: the solution fails: ${solved.reason}\n${solved.check}`);
    const without = workspace(task, 'without', tarballs);
    const present = AGENT_FILES.filter((f) => existsSync(join(without, f)));
    console.log(`  without: ${present.length ? `has ${present.join(', ')}` : 'no agent files'}`);
    if (present.length) failed.push(`${task.id}: without has ${present.join(', ')}`);
    for (const dir of [app, without]) rmSync(dirname(dir), { recursive: true, force: true });
  }
  for (const agent of agents) {
    console.log(`agent-eval: not run: ${[...AGENTS[agent], '<prompt.md>'].join(' ')}`);
  }
  return failed;
}

interface Result {
  task: string;
  agent: string;
  variant: string;
  run: number;
  pass: boolean;
  reason?: string;
  ms: number;
}

/** Every run of the matrix; writes the results as it goes; returns the CP3 gate failures. */
function evaluate(tarballs: Record<string, string>): string[] {
  const sha = must(run('git', ['rev-parse', '--short', 'HEAD'], ROOT)).trim();
  const date = new Date().toISOString().slice(0, 10);
  const dir = join(resolve(values.out), `${date}-${sha}`);
  const versions = Object.fromEntries(
    agents.map((a) => [a, must(run(AGENTS[a][0], ['--version'], ROOT)).trim()]),
  );
  const warnings = GLOBAL_FILES.filter((f) => existsSync(f)).map(
    (f) => `the global instruction file ${f} reaches the agent`,
  );
  for (const w of warnings) console.warn(`agent-eval: warning: ${w}`);
  const results: Result[] = [];
  const save = () =>
    writeFileSync(
      join(dir, 'results.json'),
      `${JSON.stringify({ sha, date, versions, warnings, runs: results }, null, 2)}\n`,
    );
  for (const task of selected) {
    const prompt = readFileSync(join(FIXTURES, task.id, 'prompt.md'), 'utf8');
    for (const agent of agents) {
      for (const variant of ['with', 'without']) {
        for (let n = 1; n <= runs; n++) {
          const name = `${task.id}-${agent}-${variant}-${n}`;
          console.log(`agent-eval: ${name}`);
          const app = workspace(task, variant, tarballs);
          const [cmd, ...args] = AGENTS[agent];
          const start = Date.now();
          const r = spawnSync(cmd, [...args, prompt], {
            cwd: app,
            env,
            encoding: 'utf8',
            timeout: TIMEOUT,
            maxBuffer: 256 * 1024 * 1024,
          });
          const ms = Date.now() - start;
          const g = grade(task, app);
          const reason = g.reason ?? (r.error ? `agent: ${r.error.message}` : undefined);
          const out = join(dir, name);
          mkdirSync(out, { recursive: true });
          writeFileSync(join(out, 'agent.jsonl'), r.stdout);
          writeFileSync(join(out, 'agent.stderr.txt'), r.stderr);
          writeFileSync(join(out, 'diff.patch'), g.diff);
          writeFileSync(join(out, 'check.json'), g.check);
          results.push({ task: task.id, agent, variant, run: n, pass: g.pass, reason, ms });
          save();
          rmSync(dirname(app), { recursive: true, force: true });
          console.log(`  ${g.pass ? 'pass' : `fail (${reason})`}`);
        }
      }
    }
  }

  const rate = (rows: Result[]) => rows.filter((r) => r.pass).length / rows.length;
  const pct = (rows: Result[]) => `${Math.round(rate(rows) * 100)}%`.padStart(5);
  console.log(
    `\n${'task'.padEnd(20)}${agents
      .flatMap((a) => [`${a}/with`, `${a}/without`])
      .map((h) => h.padStart(16))
      .join('')}`,
  );
  for (const id of [...selected.map((t) => t.id), 'all']) {
    const cells = agents.flatMap((agent) =>
      ['with', 'without'].map((variant) =>
        pct(
          results.filter(
            (r) => r.agent === agent && r.variant === variant && (id === 'all' || r.task === id),
          ),
        ).padStart(16),
      ),
    );
    console.log(`${id.padEnd(20)}${cells.join('')}`);
  }
  console.log(`\nagent-eval: results in ${dir}`);
  return agents
    .filter((agent) => rate(results.filter((r) => r.agent === agent && r.variant === 'with')) < 0.8)
    .map((agent) => `${agent} passes less than 80% of its with runs`);
}

try {
  console.log('agent-eval: build');
  must(run('pnpm', ['build'], ROOT));
  console.log('agent-eval: pack');
  const { tarballs } = pack();
  const failed = values['dry-run'] ? dryRun(tarballs) : evaluate(tarballs);
  for (const f of failed) console.error(`agent-eval: failed: ${f}`);
  if (failed.length) process.exitCode = 1;
  else console.log('agent-eval: passed');
} catch (error) {
  console.error('agent-eval: error\n', error);
  process.exitCode = 1;
} finally {
  cleanup();
}
