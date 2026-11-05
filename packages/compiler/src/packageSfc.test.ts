import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { allowsPackageSfc } from './packageSfc.ts';

const dirs: string[] = [];
afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function temp(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'vibe-sfc-'));
  dirs.push(dir);
  return dir;
}

describe('allowsPackageSfc', () => {
  it('compiles application files and opted-in packages only', async () => {
    expect(allowsPackageSfc('/app/src/App.vibe')).toBe(true);
    expect(allowsPackageSfc('/app/node_modules/')).toBe(false);
    expect(allowsPackageSfc('/app/node_modules/pkg')).toBe(false);
    expect(allowsPackageSfc('/app/node_modules/@scope')).toBe(false);

    const root = await temp();
    const scoped = join(root, 'node_modules/@fixture/sfc-lib');
    const plain = join(root, 'node_modules/@fixture/plain-lib');
    const broken = join(root, 'node_modules/broken');
    const flag = join(root, 'node_modules/flagged');
    await mkdir(join(scoped, 'src'), { recursive: true });
    await mkdir(plain, { recursive: true });
    await mkdir(join(broken, 'src'), { recursive: true });
    await mkdir(join(flag, 'src'), { recursive: true });
    await writeFile(
      join(scoped, 'package.json'),
      JSON.stringify({ name: '@fixture/sfc-lib', vibejs: { sfc: true } }),
    );
    await writeFile(join(plain, 'package.json'), JSON.stringify({ name: '@fixture/plain-lib' }));
    await writeFile(join(broken, 'package.json'), '{');
    await writeFile(join(flag, 'package.json'), JSON.stringify({ vibejs: { sfc: false } }));
    expect(allowsPackageSfc(join(scoped, 'src/Button.vibe'))).toBe(true);
    expect(allowsPackageSfc(join(plain, 'Hidden.vibe'))).toBe(false);
    expect(allowsPackageSfc(join(broken, 'src/A.vibe'))).toBe(false);
    expect(allowsPackageSfc(join(flag, 'src/A.vibe'))).toBe(false);
    expect(allowsPackageSfc(join(root, 'node_modules/missing/A.vibe'))).toBe(false);
    expect(allowsPackageSfc(`${root}\\node_modules\\flagged\\src\\A.vibe`)).toBe(false);
  });
});
