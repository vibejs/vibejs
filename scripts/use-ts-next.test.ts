import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { nextVersion, releaseAge, setTypescript } from './use-ts-next.ts';

const yaml = `packages:
  - packages/*

minimumReleaseAge: 1440

catalog:
  typescript: 7.0.2
  vite: 8.3.4

catalogs:
  ts-next:
    typescript: 7.1.0-dev.20261015.1
`;

describe('setTypescript', () => {
  it('changes exactly the two typescript catalog lines', () => {
    expect(setTypescript(yaml, '7.1.0-dev.20261018.1')).toBe(
      yaml
        .replace('typescript: 7.0.2', 'typescript: 7.1.0-dev.20261018.1')
        .replace('typescript: 7.1.0-dev.20261015.1', 'typescript: 7.1.0-dev.20261018.1'),
    );
  });

  it('rejects a version that is not exact', () => {
    expect(() => setTypescript(yaml, '^7.1.0')).toThrow('Not an exact version: ^7.1.0');
  });

  it('fails when an entry is missing', () => {
    const noNext = yaml.slice(0, yaml.indexOf('catalogs:'));
    expect(() => setTypescript(noNext, '7.1.0')).toThrow('catalogs.ts-next.typescript');
  });
});

describe('releaseAge', () => {
  it('reads the top-level minimumReleaseAge', () => {
    expect(releaseAge(yaml)).toBe(1440);
  });

  it('fails when minimumReleaseAge is missing', () => {
    expect(() => releaseAge(yaml.replace('minimumReleaseAge: 1440\n', ''))).toThrow(
      'Expected minimumReleaseAge in the YAML',
    );
  });
});

const now = Date.parse('2026-10-20T12:00:00.000Z');
const day = 24 * 60;
const time = {
  created: '2012-10-01T00:00:00.000Z',
  '7.0.2': '2026-10-01T00:00:00.000Z',
  '7.1.0-dev.20261016.1': '2026-10-16T07:00:00.000Z',
  '7.1.0-dev.20261017.1': '2026-10-17T12:00:00.000Z',
  '7.1.0-dev.20261019.1': '2026-10-19T07:00:00.000Z',
  '7.2.0-dev.20261010.1': '2026-10-10T07:00:00.000Z',
};

describe('nextVersion', () => {
  it('picks the newest 7.1 nightly that is old enough', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () => Response.json({ time }));
    vi.stubGlobal('fetch', fetch);
    await expect(nextVersion(4 * day, now)).resolves.toBe('7.1.0-dev.20261016.1');
    expect(fetch).toHaveBeenCalledOnce();
    expect(fetch).toHaveBeenCalledWith('https://registry.npmjs.org/typescript');
  });

  it('accepts a nightly published exactly at the cutoff', async () => {
    vi.stubGlobal('fetch', async () => Response.json({ time }));
    await expect(nextVersion(3 * day, now)).resolves.toBe('7.1.0-dev.20261017.1');
  });

  it('defaults to the current time', async () => {
    vi.stubGlobal('fetch', async () => Response.json({ time }));
    await expect(nextVersion(0)).resolves.toBe('7.1.0-dev.20261019.1');
  });

  it('fails on a registry error', async () => {
    vi.stubGlobal('fetch', async () => new Response(null, { status: 503 }));
    await expect(nextVersion(3 * day, now)).rejects.toThrow('npm registry answered 503');
  });

  it('fails when no 7.1 nightly is old enough', async () => {
    vi.stubGlobal('fetch', async () => Response.json({ time }));
    await expect(nextVersion(5 * day, now)).rejects.toThrow(
      `npm registry: no typescript 7.1 nightly is at least ${5 * day} minutes old`,
    );
  });

  it('fails when the registry has no time map', async () => {
    vi.stubGlobal('fetch', async () => Response.json({}));
    await expect(nextVersion(0, now)).rejects.toThrow('no typescript 7.1 nightly');
  });
});

const pkg = `{
  "devDependencies": {
    "typescript": "7.1.0-dev.20261015.1"
  },
  "overrides": {
    "typescript": "$typescript"
  }
}
`;

/** Runs the script and returns the new pnpm-workspace.yaml after checking the template write. */
async function runScript(version: string, ...args: string[]): Promise<string> {
  const writeFileSync = vi.fn<(file: string, text: string) => void>();
  const readFileSync = (file: string) => (file.endsWith('package.json') ? pkg : yaml);
  vi.doMock('node:fs', () => ({ readFileSync, writeFileSync }));
  vi.spyOn(console, 'log').mockImplementation(() => {});
  process.argv = ['node', fileURLToPath(new URL('use-ts-next.ts', import.meta.url)), ...args];
  vi.resetModules();
  await import('./use-ts-next.ts');
  const root = new URL('../', import.meta.url);
  expect(writeFileSync.mock.calls).toEqual([
    [fileURLToPath(new URL('pnpm-workspace.yaml', root)), expect.any(String)],
    [
      fileURLToPath(new URL('packages/create-vibejs/templates/fullstack/package.json', root)),
      pkg.replace('7.1.0-dev.20261015.1', version),
    ],
  ]);
  return writeFileSync.mock.calls[0][1];
}

describe('as a script', () => {
  const argv = process.argv;
  afterEach(() => {
    process.argv = argv;
    vi.doUnmock('node:fs');
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('pins the given version', async () => {
    expect(await runScript('7.1.0-dev.20261018.1', '7.1.0-dev.20261018.1')).toBe(
      setTypescript(yaml, '7.1.0-dev.20261018.1'),
    );
  });

  it('pins the newest nightly at least minimumReleaseAge old when no version is given', async () => {
    vi.useFakeTimers({ now, toFake: ['Date'] });
    vi.stubGlobal('fetch', async () => Response.json({ time }));
    // minimumReleaseAge: 1440 (one day) admits 20261019.1; the repository's 4320 would not.
    expect(await runScript('7.1.0-dev.20261019.1')).toBe(
      setTypescript(yaml, '7.1.0-dev.20261019.1'),
    );
  });
});
