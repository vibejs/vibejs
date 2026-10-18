import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { nextVersion, setTypescript } from './use-ts-next.ts';

const yaml = `packages:
  - packages/*

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

describe('nextVersion', () => {
  it('reads the next dist-tag from the registry', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () =>
      Response.json({ latest: '7.0.2', next: '7.1.0-dev.1' }),
    );
    vi.stubGlobal('fetch', fetch);
    await expect(nextVersion()).resolves.toBe('7.1.0-dev.1');
    expect(fetch).toHaveBeenCalledWith('https://registry.npmjs.org/-/package/typescript/dist-tags');
  });

  it('fails on a registry error', async () => {
    vi.stubGlobal('fetch', async () => new Response(null, { status: 503 }));
    await expect(nextVersion()).rejects.toThrow('npm registry answered 503');
  });

  it('fails when the registry has no next dist-tag', async () => {
    vi.stubGlobal('fetch', async () => Response.json({ latest: '7.0.2' }));
    await expect(nextVersion()).rejects.toThrow('typescript has no next dist-tag');
  });
});

async function runScript(...args: string[]): Promise<string> {
  const writeFileSync = vi.fn<(file: string, text: string) => void>();
  vi.doMock('node:fs', () => ({ readFileSync: () => yaml, writeFileSync }));
  vi.spyOn(console, 'log').mockImplementation(() => {});
  process.argv = ['node', fileURLToPath(new URL('use-ts-next.ts', import.meta.url)), ...args];
  vi.resetModules();
  await import('./use-ts-next.ts');
  expect(writeFileSync).toHaveBeenCalledOnce();
  const [file, text] = writeFileSync.mock.calls[0];
  expect(file).toBe(fileURLToPath(new URL('../pnpm-workspace.yaml', import.meta.url)));
  return text;
}

describe('as a script', () => {
  const argv = process.argv;
  afterEach(() => {
    process.argv = argv;
    vi.doUnmock('node:fs');
    vi.restoreAllMocks();
  });

  it('pins the given version', async () => {
    expect(await runScript('7.1.0-dev.20261018.1')).toBe(
      setTypescript(yaml, '7.1.0-dev.20261018.1'),
    );
  });

  it('pins typescript@next when no version is given', async () => {
    vi.stubGlobal('fetch', async () => Response.json({ next: '7.1.0-dev.2' }));
    expect(await runScript()).toBe(setTypescript(yaml, '7.1.0-dev.2'));
  });
});
