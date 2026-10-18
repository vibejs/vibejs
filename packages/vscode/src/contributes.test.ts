import { spawnSync } from 'node:child_process';
import { existsSync, globSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const dir = fileURLToPath(new URL('..', import.meta.url));
const json = (file: string) => JSON.parse(readFileSync(dir + file, 'utf8'));
const pkg = json('package.json');
const syntaxes = globSync('syntaxes/*.json', { cwd: dir }).toSorted();

describe('grammar', () => {
  it('matches the committed snapshots', () => {
    const fixtures = globSync('test/grammar/*.vibe', { cwd: dir });
    expect(fixtures.length).toBeGreaterThan(0);
    // The snapshot tool writes a missing .snap instead of failing.
    expect(fixtures.filter((fixture) => !existsSync(`${dir}${fixture}.snap`))).toEqual([]);
    // The shipped grammars come from package.json; TS and HTML are vendored, and the style
    // languages are empty stubs, so that only their scope names show.
    const grammars = globSync('test/grammars/*', { cwd: dir }).flatMap((file) => ['-g', file]);
    const snap = fileURLToPath(import.meta.resolve('vscode-tmgrammar-test/dist/snapshot.js'));
    const result = spawnSync(process.execPath, [snap, ...grammars, 'test/grammar/*.vibe'], {
      cwd: dir,
      encoding: 'utf8',
    });
    // The output is part of the compared value, so that a failure shows the token diff.
    expect({ status: result.status, output: result.stdout + result.stderr }).toEqual({
      status: 0,
      output: expect.any(String),
    });
  }, 30_000);

  it('uses vibejs scope names only', () => {
    const scopes: string[] = [];
    const walk = (node: unknown): void => {
      if (typeof node !== 'object' || node === null) return;
      for (const [key, value] of Object.entries(node)) {
        const scope = ['name', 'scopeName', 'contentName', 'injectionSelector'].includes(key);
        if (scope && typeof value === 'string') scopes.push(value);
        else walk(value);
      }
    };
    for (const file of syntaxes) walk(json(file));
    expect(scopes.length).toBeGreaterThan(100);
    expect(scopes.filter((scope) => /vue/i.test(scope))).toEqual([]);
  });

  it('injects into source.vibejs only', () => {
    const injections = pkg.contributes.grammars.filter((g: { injectTo?: string[] }) => g.injectTo);
    expect(injections.map((g: { scopeName: string }) => g.scopeName)).toEqual([
      'vibejs.directives',
      'vibejs.interpolations',
    ]);
    for (const grammar of injections) {
      expect(grammar.injectTo).toEqual(['source.vibejs']);
      const { injectionSelector, scopeName } = json(grammar.path);
      expect(scopeName).toBe(grammar.scopeName);
      for (const selector of injectionSelector.split(',')) {
        expect(selector.trim()).toMatch(/^L:source\.vibejs /);
      }
    }
  });

  it('ships every file package.json points to', () => {
    const [language] = pkg.contributes.languages;
    const paths = [
      language.configuration,
      ...pkg.contributes.grammars.map((g: { path: string }) => g.path),
    ];
    expect(paths.map((path: string) => path.replace(/^\.\//, '')).toSorted()).toEqual([
      'language-configuration.json',
      ...syntaxes,
    ]);
    expect(paths.filter((path: string) => !existsSync(dir + path))).toEqual([]);
    expect(json(language.configuration).comments).toEqual({ blockComment: ['<!--', '-->'] });
  });
});

describe('manifest', () => {
  it('declares the vibejs.vibejs extension for .vibe files', () => {
    expect(`${pkg.publisher}.${pkg.name}`).toBe('vibejs.vibejs');
    expect(pkg.private).toBe(true);
    expect(pkg.contributes.languages).toEqual([
      expect.objectContaining({ id: 'vibejs', aliases: ['vibe.js'], extensions: ['.vibe'] }),
    ]);
    expect(pkg.contributes.grammars[0]).toMatchObject({
      language: 'vibejs',
      scopeName: 'source.vibejs',
    });
    expect(pkg.activationEvents).toEqual(['onLanguage:vibejs']);
    expect(pkg.capabilities.untrustedWorkspaces.supported).toBe('limited');
  });

  it('targets a VS Code no older than the @types/vscode pin', () => {
    expect(pkg.engines.vscode).toBe('^1.126.0');
    const workspace = readFileSync(`${dir}../../pnpm-workspace.yaml`, 'utf8');
    // vsce rejects @types/vscode newer than engines.vscode.
    const pin = /^ {2}'@types\/vscode': 1\.(\d+)\.\d+$/m.exec(workspace);
    expect(Number(pin?.[1])).toBeLessThanOrEqual(126);
  });

  it('points main at the tsdown output', () => {
    expect(readFileSync(`${dir}tsdown.config.ts`, 'utf8')).toMatch(
      /entry: 'src\/extension\.ts',\n {2}format: 'cjs',/,
    );
    expect(pkg.main).toBe('./dist/extension.cjs');
  });
});
