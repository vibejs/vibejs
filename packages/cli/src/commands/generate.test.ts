import { cpSync, globSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { testCtx } from '../../test/app.ts';
import { main } from '../main.ts';
import { exitCode } from '../output.ts';
import { generate, type GenerateResult } from './generate.ts';

const failure = vi.hoisted(() => ({ error: undefined as Error | undefined }));
vi.mock(import('../generate/plan.ts'), async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    names: (...args: Parameters<typeof actual.names>) => {
      if (failure.error) throw failure.error;
      return actual.names(...args);
    },
  };
});

const TEMPLATE = new URL('../../../create-vibejs/templates/fullstack', import.meta.url);

let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'vibejs-generate-'));
  cpSync(TEMPLATE, root, { recursive: true });
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

/** Every file below the root with its content. */
const snapshot = () =>
  Object.fromEntries(
    globSync('**/*', { cwd: root, withFileTypes: true })
      .filter((d) => d.isFile())
      .map((d) => [join(d.parentPath, d.name), readFileSync(join(d.parentPath, d.name), 'utf8')]),
  );

async function run(
  positionals: string[],
  values: Record<string, string | boolean> = {},
  options: { agent?: boolean; consent?: string; cwd?: string } = {},
): Promise<GenerateResult> {
  const t = testCtx(options.cwd ?? root, options.agent ?? true);
  t.ctx.consent = options.consent;
  return generate.run({ values, positionals }, t.ctx);
}

it('writes nothing in a dry run and returns every op with its content', async () => {
  const before = snapshot();
  const r = await run(['resource', 'users'], { 'dry-run': true });
  expect(snapshot()).toEqual(before);
  expect(r).toMatchObject({ ok: true, kind: 'resource', name: 'users', dryRun: true });
  expect(r.ops).toHaveLength(7);
  for (const op of r.ops) expect(op).toHaveProperty('content');
  expect(r.next).toEqual(['vibejs check --json']);
});

it('writes the files without contents in the result, then only skips', async () => {
  const r = await run(['resource', 'users']);
  expect(exitCode(r)).toBe(0);
  for (const op of r.ops) expect(op).not.toHaveProperty('content');
  expect(readFileSync(join(root, 'server/src/users/users.module.ts'), 'utf8')).toContain(
    'export class UsersModule {}',
  );
  expect(generate.human(r).split('\n')[0]).toBe('create   contracts/src/users.contract.ts');

  const again = await run(['resource', 'users']);
  expect(again.ok).toBe(true);
  expect(again.ops.map((o) => o.op)).toEqual(Array(7).fill('skip'));
});

it('reports a changed file as VIBE8401 with exit 1 and writes nothing', async () => {
  await run(['component', 'UserCard']);
  const file = join(root, 'ui/src/components/UserCard.vibe');
  writeFileSync(file, '<template><p>mine</p></template>\n');
  rmSync(join(root, 'ui/src/components/UserCard.test.ts'));
  const r = await run(['component', 'UserCard']);
  expect(r).toMatchObject({
    ok: false,
    next: ['vibejs generate component UserCard --dry-run --json'],
    error: {
      code: 'VIBE8401',
      message:
        '1 file(s) differ from what `vibejs generate component UserCard` writes: ui/src/components/UserCard.vibe.',
    },
  });
  expect(exitCode(r)).toBe(1);
  expect(JSON.stringify(r.ops)).toBe(
    '[{"op":"conflict","path":"ui/src/components/UserCard.vibe"},{"op":"create","path":"ui/src/components/UserCard.test.ts"}]',
  );
  expect(readFileSync(file, 'utf8')).toBe('<template><p>mine</p></template>\n');
  expect(globSync('ui/src/components/*.test.ts', { cwd: root })).toEqual([]);
  const dry = await run(['component', 'UserCard'], { 'dry-run': true });
  expect(dry).toMatchObject({ error: { code: 'VIBE8401' } });
  expect(dry.ops[1]).toMatchObject({ op: 'create', content: expect.stringContaining('mount(') });
});

it('needs consent for --force in agent mode, and echoes it', async () => {
  await run(['page', 'Users']);
  const file = join(root, 'ui/src/pages/UsersPage.vibe');
  writeFileSync(file, 'mine\n');
  const before = snapshot();
  const refused = await run(['page', 'Users'], { force: true });
  expect(refused).toMatchObject({
    ok: false,
    error: { code: 'VIBE8010' },
    next: ["VIBEJS_USER_CONSENT='<their words>' vibejs generate page Users --force"],
  });
  expect(exitCode(refused)).toBe(2);
  expect(snapshot()).toEqual(before);

  const r = await run(['page', 'Users'], { force: true }, { consent: 'yes, overwrite it' });
  expect(r).toMatchObject({ ok: true, consent: 'yes, overwrite it' });
  expect(r.ops).toContainEqual({
    op: 'update',
    path: 'ui/src/pages/UsersPage.vibe',
    reason: 'forced',
  });
  expect(readFileSync(file, 'utf8')).toContain('<h1>Users</h1>');
});

it('overwrites with --force in human mode without consent', async () => {
  await run(['component', 'UserCard']);
  const file = join(root, 'ui/src/components/UserCard.vibe');
  writeFileSync(file, 'mine\n');
  const r = await run(['component', 'UserCard'], { force: true }, { agent: false });
  expect(r.ok).toBe(true);
  expect(r.consent).toBeUndefined();
  expect(readFileSync(file, 'utf8')).toContain('defineProps');
});

it('reports manual registrations in next and in the human text, with exit 0', async () => {
  rmSync(join(root, 'ui/src/routes.ts'));
  const r = await run(['page', 'Users']);
  expect(exitCode(r)).toBe(0);
  const instruction = r.ops.find((o) => o.op === 'manual')!;
  expect(instruction).toMatchObject({ path: 'ui/src/routes.ts', code: 'VIBE8402' });
  expect(r.next).toEqual(['vibejs check --json', expect.stringMatching(/^Register `/)]);
  expect(generate.human(r)).toContain('manual   ui/src/routes.ts  Register `');
});

it('rejects an invalid name with VIBE8403, exit 2 and a corrected command', async () => {
  for (const [kind, name, singular, next] of [
    ['resource', 'my-thing', undefined, 'vibejs generate resource myThing'],
    ['resource', '123', undefined, 'vibejs generate resource users'],
    ['resource', 'delete', undefined, 'vibejs generate resource users'],
    ['component', 'userCard', undefined, 'vibejs generate component UserCard'],
    ['resource', 'people', 'Person', 'vibejs generate resource people --singular person'],
    ['component', 'userCard', 'x', 'vibejs generate component UserCard'],
  ] as const) {
    const r = await run([kind, name], singular ? { singular } : {});
    expect(r).toMatchObject({ ok: false, error: { code: 'VIBE8403' }, next: [next] });
    expect(exitCode(r)).toBe(2);
  }
});

it('uses --singular for the resource names', async () => {
  const r = await run(['resource', 'people'], { singular: 'person', 'dry-run': true });
  const contract = r.ops.find((o) => o.path === 'contracts/src/people.contract.ts');
  expect(contract).toMatchObject({ content: expect.stringContaining('PERSON_NOT_FOUND: 404') });
});

it('needs a project and a known kind', async () => {
  const outside = await run(['resource', 'users'], {}, { cwd: tmpdir() });
  expect(outside).toMatchObject({ ok: false, error: { code: 'VIBE8001' } });
  expect(exitCode(outside)).toBe(2);
  const unknown = await run(['module', 'users']);
  expect(unknown).toMatchObject({
    ok: false,
    error: { code: 'VIBE8004' },
    next: ['vibejs generate --help'],
  });
  expect(exitCode(unknown)).toBe(2);
});

it('rethrows an error other than a VibeError', async () => {
  failure.error = new TypeError('boom');
  try {
    await expect(run(['resource', 'users'])).rejects.toThrow('boom');
  } finally {
    failure.error = undefined;
  }
});

it('answers vibejs g without input with VIBE8003 listing the kinds', async () => {
  const t = testCtx(root);
  expect(await main(['g'], t.ctx)).toBe(2);
  expect(JSON.parse(t.out.join(''))).toMatchObject({
    command: 'generate',
    error: {
      code: 'VIBE8003',
      missing: [{ name: 'kind', values: ['resource', 'component', 'page'] }],
    },
  });
});
