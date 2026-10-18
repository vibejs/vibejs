import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const dir = fileURLToPath(new URL('..', import.meta.url));
const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));

/** The entry names in the central directory of a zip file. */
function zipEntries(zip: Buffer): string[] {
  const end = zip.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  const names: string[] = [];
  for (let at = zip.readUInt32LE(end + 16), n = zip.readUInt16LE(end + 10); n > 0; n--) {
    const length = zip.readUInt16LE(at + 28);
    names.push(zip.toString('utf8', at + 46, at + 46 + length));
    at += 46 + length + zip.readUInt16LE(at + 30) + zip.readUInt16LE(at + 32);
  }
  return names.toSorted();
}

describe('bundle', () => {
  const bundle = readFileSync(join(dir, pkg.main), 'utf8');

  it('requires only vscode and bundles @vibejs-org/errors', () => {
    expect([...bundle.matchAll(/\brequire\(\s*["']([^"']+)["']\s*\)/g)].map((m) => m[1])).toEqual([
      'vscode',
    ]);
    expect(bundle).not.toMatch(/\bimport\s*\(|from\s*["']|["']typescript["']|@vibejs-org\//);
  });

  it('contains the VIBE6101 and VIBE6102 messages', () => {
    expect(bundle).toContain('Install the {extension} extension to type-check .vibe files.');
    expect(bundle).toContain('Trust this workspace to type-check .vibe files.');
  });
});

describe('vsce package', () => {
  it('packages exactly the shipped files', () => {
    const out = mkdtempSync(join(tmpdir(), 'vibejs-vsix-'));
    try {
      const vsix = join(out, 'vibejs.vsix');
      const vsce = join(dir, 'node_modules/@vscode/vsce/vsce');
      execFileSync(process.execPath, [vsce, 'package', '--no-dependencies', '--out', vsix], {
        cwd: dir,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      expect(zipEntries(readFileSync(vsix))).toEqual(
        [
          '[Content_Types].xml',
          'extension.vsixmanifest',
          'extension/LICENSE.txt',
          'extension/THIRD-PARTY-NOTICES.md',
          'extension/dist/extension.cjs',
          'extension/language-configuration.json',
          'extension/package.json',
          'extension/readme.md',
          'extension/syntaxes/vibejs-directives.tmLanguage.json',
          'extension/syntaxes/vibejs-interpolations.tmLanguage.json',
          'extension/syntaxes/vibejs.tmLanguage.json',
        ].toSorted(),
      );
    } finally {
      rmSync(out, { recursive: true, force: true });
    }
  }, 60_000);
});
