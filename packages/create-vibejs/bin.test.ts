import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { DOCS_BASE as ERRORS_DOCS_BASE } from '@vibejs-org/errors';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DOCS_BASE, EXEC, main, MESSAGES, nodeCtx } from './bin.js';

type Ctx = Parameters<typeof main>[1];

const TEMPLATE = fileURLToPath(new URL('templates/fullstack', import.meta.url));

let cwd: string;
beforeEach(() => {
  cwd = mkdtempSync(join(tmpdir(), 'create-vibejs-'));
  mkdirSync(join(cwd, 'agents'));
  writeFileSync(join(cwd, 'agents/AGENTS.md'), '# AGENTS.md\n\nRun `{{exec}} check --json`.\n');
  writeFileSync(join(cwd, 'agents/CLAUDE.md'), '@AGENTS.md\n');
});
afterEach(() => {
  rmSync(cwd, { recursive: true, force: true });
});

function setup(
  options: {
    agent?: boolean;
    env?: Record<string, string>;
    install?: boolean;
    answer?: string;
  } = {},
) {
  const out: string[] = [];
  const err: string[] = [];
  const ctx: Ctx = {
    cwd,
    env: options.env ?? {},
    isTTY: options.agent === false,
    stdout: (s) => out.push(s),
    stderr: (s) => err.push(s),
    prompt: vi.fn<Ctx['prompt']>(async () => options.answer ?? ''),
    exec: vi.fn<Ctx['exec']>(async () => ({
      ok: options.install ?? true,
      output: 'install output\n',
    })),
    templateDir: TEMPLATE,
    agentsDir: join(cwd, 'agents'),
    version: '1.2.3',
  };
  return { ctx, out, err, json: () => JSON.parse(out.join('')) };
}

const files = (dir: string) =>
  readdirSync(join(cwd, dir), { recursive: true }).map((f) => String(f).replaceAll('\\', '/'));
const read = (path: string) => readFileSync(join(cwd, path), 'utf8');

describe('agent mode', () => {
  it('answers a missing dir with one VIBE8104 object and exit 2, without prompting', async () => {
    const t = setup();
    expect(await main([], t.ctx)).toBe(2);
    expect(t.out).toHaveLength(1);
    expect(t.out[0]).not.toContain('\u001b[');
    expect(t.json()).toEqual({
      ok: false,
      command: 'create',
      version: '1.2.3',
      error: {
        code: 'VIBE8104',
        message:
          'Missing the project directory. Usage: create-vibejs [dir] [--pm pnpm|npm|yarn|bun] [--no-install]',
        docs: 'https://vibejs.org/v0/errors/VIBE8104',
        fixes: ['Run `npm create vibejs@latest my-app`.'],
        missing: [{ name: 'dir', example: 'npm create vibejs@latest my-app' }],
      },
    });
    expect(t.json().error.missing[0].name).toBe('dir');
    expect(t.ctx.prompt).not.toHaveBeenCalled();
    expect(t.err).toEqual([]);
  });

  it('is on with VIBEJS_AGENT=1 on a terminal', async () => {
    const t = setup({ agent: false, env: { VIBEJS_AGENT: '1' } });
    expect(await main([], t.ctx)).toBe(2);
    expect(t.json().error.code).toBe('VIBE8104');
  });

  it.each([
    [['--force', 'app'], "Invalid option '--force'"],
    [['--pm'], "Invalid option '--pm <value>'"],
    [['--pm', 'deno', 'app'], '`--pm deno` is not one of pnpm, npm, yarn, bun'],
    [['a', 'b'], 'Unexpected argument `b`'],
  ])('rejects %j with VIBE8104', async (argv, problem) => {
    const t = setup();
    expect(await main(argv, t.ctx)).toBe(2);
    expect(t.json().error).toMatchObject({ code: 'VIBE8104' });
    expect(t.json().error.message).toContain(problem);
    expect(existsSync(join(cwd, 'app'))).toBe(false);
  });

  it('rejects a non-empty directory with VIBE8101 and touches nothing', async () => {
    mkdirSync(join(cwd, 'app'));
    writeFileSync(join(cwd, 'app/keep.txt'), 'x');
    const t = setup();
    expect(await main(['app'], t.ctx)).toBe(2);
    expect(t.json().error).toMatchObject({
      code: 'VIBE8101',
      fixes: [
        'Pass the name of a new directory, as in `npm create vibejs@latest my-app`.',
        'Empty `app` first if it holds nothing you need.',
      ],
    });
    expect(files('app')).toEqual(['keep.txt']);
  });

  it('rejects an existing file with VIBE8101', async () => {
    writeFileSync(join(cwd, 'app'), 'x');
    const t = setup();
    expect(await main(['app'], t.ctx)).toBe(2);
    expect(t.json().error).toMatchObject({
      code: 'VIBE8101',
      message: expect.stringMatching(/^`app` is not an empty directory;/),
    });
    expect(read('app')).toBe('x');
  });

  it.each(['My App', '.app', 'App', 'x'.repeat(215)])('rejects %j with VIBE8102', async (dir) => {
    const t = setup();
    expect(await main([dir], t.ctx)).toBe(2);
    expect(t.json().error).toMatchObject({ code: 'VIBE8102' });
  });

  it('writes the project into an empty directory and installs it', async () => {
    mkdirSync(join(cwd, 'apps/web'), { recursive: true });
    const t = setup({ env: { npm_config_user_agent: 'pnpm/12.14.0 npm/? node/v24.15.0' } });
    expect(await main(['apps/web'], t.ctx)).toBe(0);
    expect(t.json()).toEqual({
      ok: true,
      command: 'create',
      version: '1.2.3',
      next: ['cd apps/web', 'pnpm run dev', 'pnpm run check'],
      dir: 'apps/web',
      pm: 'pnpm',
      installed: true,
    });
    expect(t.ctx.exec).toHaveBeenCalledExactlyOnceWith('pnpm install', join(cwd, 'apps/web'), true);
    // The install output is captured: stdout carries only the JSON object.
    expect(t.out).toHaveLength(1);
    expect(t.err).toEqual([]);

    const written = files('apps/web');
    expect(written).toContain('.gitignore');
    expect(written).not.toContain('_gitignore');
    expect(written).toEqual(expect.arrayContaining(['AGENTS.md', 'CLAUDE.md', 'ui/src/App.vibe']));
    for (const file of readdirSync(join(cwd, 'apps/web'), {
      recursive: true,
      withFileTypes: true,
    })) {
      if (!file.isFile()) continue;
      const text = readFileSync(join(file.parentPath, file.name), 'utf8');
      expect(text).not.toContain('0.0.0-template');
      expect(text).not.toContain('{{exec}}');
    }
    const manifest = JSON.parse(read('apps/web/package.json'));
    expect(manifest.name).toBe('web');
    expect(manifest.dependencies['@vibejs-org/ui']).toBe('^1.2.3');
    expect(read('apps/web/AGENTS.md')).toContain('Run `pnpm exec vibejs check --json`.');
    expect(read('apps/web/CLAUDE.md')).toBe('@AGENTS.md\n');
  });

  it('installs nothing with --no-install and lists the install as the next step', async () => {
    const t = setup();
    expect(await main(['app', '--no-install', '--pm', 'yarn'], t.ctx)).toBe(0);
    expect(t.ctx.exec).not.toHaveBeenCalled();
    expect(t.json()).toMatchObject({
      pm: 'yarn',
      installed: false,
      next: ['cd app', 'yarn install', 'yarn run dev', 'yarn run check'],
    });
    expect(read('app/AGENTS.md')).toContain('`yarn vibejs check --json`');
  });

  it('keeps the files and reports VIBE8103 with exit 1 when the install fails', async () => {
    const t = setup({ install: false });
    expect(await main(['app', '--pm', 'npm'], t.ctx)).toBe(1);
    expect(t.json()).toMatchObject({
      ok: false,
      next: ['cd app', 'npm install'],
      error: {
        code: 'VIBE8103',
        message: '`npm install` failed in `app`; the project files are kept.',
        fixes: ['Run `npm install` in `app` again.'],
      },
    });
    expect(t.err).toEqual(['install output\n']);
    expect(existsSync(join(cwd, 'app/package.json'))).toBe(true);
  });

  it('quotes a directory with whitespace in the cd step', async () => {
    const t = setup({ install: false });
    expect(await main(['sub dir/app'], t.ctx)).toBe(1);
    expect(t.json().next).toEqual(['cd "sub dir/app"', 'npm install']);
    const ok = setup();
    expect(await main(['sub dir/web'], ok.ctx)).toBe(0);
    expect(ok.json().next[0]).toBe('cd "sub dir/web"');
  });
});

describe('package manager', () => {
  it.each([
    [['--pm', 'bun'], {}, 'bun'],
    [['--pm', 'npm'], { npm_config_user_agent: 'pnpm/12.14.0' }, 'npm'],
    [[], { npm_config_user_agent: 'pnpm/12.14.0 npm/? node/v24.15.0' }, 'pnpm'],
    [[], { npm_config_user_agent: 'npm/11.0.0 node/v24.15.0' }, 'npm'],
    [[], { npm_config_user_agent: 'yarn/4.9.0 npm/? node/v24.15.0' }, 'yarn'],
    [[], { npm_config_user_agent: 'bun/1.3.0 npm/? node/v24.15.0' }, 'bun'],
    [[], { npm_config_user_agent: 'deno/2.0.0' }, 'npm'],
    [[], {}, 'npm'],
  ] as const)('%j with %j is %s', async (argv, env, pm) => {
    const t = setup({ env });
    expect(await main(['app', '--no-install', ...argv], t.ctx)).toBe(0);
    expect(t.json().pm).toBe(pm);
    expect(read('app/AGENTS.md')).toContain(`Run \`${EXEC[pm]} check --json\`.`);
  });

  it('runs the CLI with the execPrefix table of @vibejs-org/cli', () => {
    // Keep in sync with execPrefix in packages/cli/src/agents.ts (its test pins the same values).
    expect(EXEC).toEqual({
      pnpm: 'pnpm exec vibejs',
      npm: 'npx --no vibejs',
      yarn: 'yarn vibejs',
      bun: 'npx --no vibejs',
    });
  });
});

describe('human mode', () => {
  it('prompts once for the directory, installs with live output and prints next steps', async () => {
    const t = setup({ agent: false, answer: ' my-app ' });
    expect(await main([], t.ctx)).toBe(0);
    expect(t.ctx.prompt).toHaveBeenCalledExactlyOnceWith('Project directory (vibejs-app): ');
    expect(t.ctx.exec).toHaveBeenCalledExactlyOnceWith('npm install', join(cwd, 'my-app'), false);
    expect(t.out.join('')).toBe(
      'Installing the dependencies with npm...\nCreated my-app. Next:\n  cd my-app\n  npm run dev\n  npm run check\n',
    );
    expect(existsSync(join(cwd, 'my-app/package.json'))).toBe(true);
  });

  it('takes the default directory for an empty answer', async () => {
    const t = setup({ agent: false });
    expect(await main(['--no-install'], t.ctx)).toBe(0);
    expect(JSON.parse(read('vibejs-app/package.json')).name).toBe('vibejs-app');
  });

  it('prints errors on stderr in the VibeError format', async () => {
    const t = setup({ agent: false });
    expect(await main(['Bad'], t.ctx)).toBe(2);
    expect(t.out).toEqual([]);
    expect(t.err.join('')).toBe(
      '[VIBE8102] `Bad` is not a valid npm package name.\n  Fix: Use a name such as `my-app`.\n  Docs: https://vibejs.org/v0/errors/VIBE8102\n',
    );
  });
});

describe('catalog', () => {
  it('uses the docs base of @vibejs-org/errors', () => {
    expect(DOCS_BASE).toBe(ERRORS_DOCS_BASE);
  });

  it('matches the messages and fixes of messages/create.md', () => {
    const text = readFileSync(new URL('messages/create.md', import.meta.url), 'utf8');
    const entries = text.split(/^## /m).slice(1);
    const parsed = Object.fromEntries(
      entries.map((entry) => [
        entry.slice(0, 8),
        [
          /^> (.+)$/m.exec(entry)![1],
          [...entry.split('### Fix')[1].matchAll(/^- (.+)$/gm)].map((m) => m[1]),
        ],
      ]),
    );
    expect(
      Object.fromEntries(Object.entries(MESSAGES).map(([code, [m, f]]) => [code, [m, f]])),
    ).toEqual(parsed);
    expect(Object.keys(parsed)).toEqual(['VIBE8101', 'VIBE8102', 'VIBE8103', 'VIBE8104']);
  });
});

/** A process with in-memory streams. */
const proc = (isTTY?: boolean) => {
  const stdout = Object.assign(new PassThrough(), { isTTY });
  return {
    cwd: () => cwd,
    env: { A: '1' },
    stdin: new PassThrough(),
    stdout,
    stderr: new PassThrough(),
  };
};

describe('nodeCtx', () => {
  it('describes the process and the package', () => {
    const p = proc(true);
    const ctx = nodeCtx(p);
    expect(ctx).toMatchObject({ cwd, env: { A: '1' }, isTTY: true, version: '0.0.0' });
    expect(nodeCtx(proc()).isTTY).toBe(false);
    expect(readdirSync(ctx.templateDir)).toContain('package.json');
    expect(ctx.agentsDir).toBe(fileURLToPath(new URL('agents', import.meta.url)));
    ctx.stdout('out');
    ctx.stderr('err');
    expect(String(p.stdout.read())).toBe('out');
    expect(String(p.stderr.read())).toBe('err');
  });

  it('prompts on stdin and stdout', async () => {
    const p = proc();
    const answer = nodeCtx(p).prompt('Dir? ');
    p.stdin.write('my-app\n');
    expect(await answer).toBe('my-app');
    expect(String(p.stdout.read())).toContain('Dir? ');
  });

  it('runs a shell command and captures its output', async () => {
    const { exec } = nodeCtx(proc());
    const node = JSON.stringify(process.execPath);
    expect(
      await exec(`${node} -e "process.stdout.write('a'); process.stderr.write('b')"`, cwd, true),
    ).toEqual({ ok: true, output: 'ab' });
    expect(await exec(`${node} -e "process.exit(3)"`, cwd, true)).toEqual({
      ok: false,
      output: '',
    });
  });

  it('runs a shell command with inherited output', async () => {
    const { exec } = nodeCtx(proc());
    const node = JSON.stringify(process.execPath);
    expect(await exec(`${node} -e "process.exit(0)"`, cwd, false)).toEqual({
      ok: true,
      output: '',
    });
  });

  it('runs main when bin.js is the main script', async () => {
    const argv = process.argv;
    const write = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
    try {
      process.argv = ['node', fileURLToPath(new URL('bin.js', import.meta.url)), '--pm', 'x'];
      vi.resetModules();
      await import('./bin.js');
      expect(process.exitCode).toBe(2);
      expect(String(write.mock.calls[0][0])).toContain('VIBE8104');
    } finally {
      process.argv = argv;
      process.exitCode = undefined;
      write.mockRestore();
    }
  });
});
