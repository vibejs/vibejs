import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { checkTitle } from './pr-meta.ts';

const S = '\u015F';

describe('checkTitle', () => {
  it('accepts Conventional Commits titles', () => {
    for (const title of ['feat(ui): add ref', 'fix: x', 'refactor(language-tools)!: drop y']) {
      expect(checkTitle(title)).toEqual([]);
    }
  });

  it('rejects other titles', () => {
    for (const title of ['update stuff', 'feat(UI): x', 'feature: x', 'fix:x', '']) {
      expect(checkTitle(title)).toEqual([
        `"${title}" is not a Conventional Commits title such as "feat(ui): add ref"`,
      ]);
    }
  });

  it('rejects a Turkish letter', () => {
    expect(checkTitle(`feat(ui): add ${S}`)).toEqual([`"feat(ui): add ${S}" is not English only`]);
  });
});

async function run(title?: string): Promise<string[]> {
  const errors: string[] = [];
  vi.spyOn(console, 'error').mockImplementation((line: string) => errors.push(line));
  vi.stubEnv('PR_TITLE', title);
  process.argv = ['node', fileURLToPath(new URL('pr-meta.ts', import.meta.url))];
  vi.resetModules();
  await import('./pr-meta.ts');
  return errors;
}

describe('as a script', () => {
  const argv = process.argv;
  afterEach(() => {
    process.argv = argv;
    process.exitCode = undefined;
  });

  it('checks PR_TITLE and sets the exit code', async () => {
    expect(await run('feat(ui): add ref')).toEqual([]);
    expect(process.exitCode).toBe(0);
    expect(await run('update stuff')).toEqual([
      'pr-meta: "update stuff" is not a Conventional Commits title such as "feat(ui): add ref"',
    ]);
    expect(process.exitCode).toBe(1);
    expect(await run()).toHaveLength(1);
    expect(process.exitCode).toBe(1);
  });
});
