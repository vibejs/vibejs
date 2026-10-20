// Usage: node scripts/use-ts-next.ts [version]
// Pins both `catalog.typescript` and `catalogs.ts-next.typescript` in pnpm-workspace.yaml to an
// exact version, or to the newest 7.1 nightly at least minimumReleaseAge old when no version is given.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const KEYS = ['catalog.typescript', 'catalogs.ts-next.typescript'];

/** Rewrites the two typescript catalog lines. Assumes 2-space YAML indentation (oxfmt). */
export function setTypescript(yaml: string, version: string): string {
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) {
    throw new Error(`Not an exact version: ${version}`);
  }
  const path: string[] = [];
  let hits = 0;
  const lines = yaml.split('\n').map((line) => {
    const match = /^( *)([^\s#:-][^:]*):/.exec(line);
    if (!match) return line;
    const [, indent, key] = match;
    path.length = indent.length / 2;
    path.push(key);
    if (!KEYS.includes(path.join('.'))) return line;
    hits++;
    return `${indent}typescript: ${version}`;
  });
  if (hits !== KEYS.length) throw new Error(`Expected ${KEYS.join(' and ')} in the YAML`);
  return lines.join('\n');
}

/** Returns the top-level `minimumReleaseAge` (minutes) of pnpm-workspace.yaml. */
export function releaseAge(yaml: string): number {
  const match = /^minimumReleaseAge: *(\d+) *$/m.exec(yaml);
  if (!match) throw new Error('Expected minimumReleaseAge in the YAML');
  return Number(match[1]);
}

/** Returns the newest typescript 7.1 nightly published at least `minutes` before `now`. */
export async function nextVersion(minutes: number, now: number = Date.now()): Promise<string> {
  const res = await fetch('https://registry.npmjs.org/typescript');
  if (!res.ok) throw new Error(`npm registry answered ${res.status}`);
  const body: unknown = await res.json();
  const time =
    typeof body === 'object' && body !== null && 'time' in body && typeof body.time === 'object'
      ? body.time
      : null;
  const cutoff = now - minutes * 60_000;
  let best: string | undefined;
  let bestTime = -Infinity;
  for (const [version, published] of Object.entries(time ?? {})) {
    const at = Date.parse(String(published));
    if (/^7\.1\.0-dev\.\d+\.\d+$/.test(version) && at <= cutoff && at > bestTime) {
      best = version;
      bestTime = at;
    }
  }
  if (best === undefined) {
    throw new Error(`npm registry: no typescript 7.1 nightly is at least ${minutes} minutes old`);
  }
  return best;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const file = fileURLToPath(new URL('../pnpm-workspace.yaml', import.meta.url));
  const yaml = readFileSync(file, 'utf8');
  const arg = process.argv.at(2);
  const version = arg ?? (await nextVersion(releaseAge(yaml)));
  writeFileSync(file, setTypescript(yaml, version));
  console.log(
    arg === undefined
      ? `typescript ${version} (newest 7.1 nightly at least minimumReleaseAge old) in catalog and catalogs.ts-next`
      : `typescript ${version} in catalog and catalogs.ts-next`,
  );
}
