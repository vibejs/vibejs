// Usage: node scripts/use-ts-next.ts [version]
// Pins both `catalog.typescript` and `catalogs.ts-next.typescript` in pnpm-workspace.yaml to an
// exact version, or to the registry's current `typescript@next` when no version is given.
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

/** Returns the version behind the `next` dist-tag of typescript. */
export async function nextVersion(): Promise<string> {
  const res = await fetch('https://registry.npmjs.org/-/package/typescript/dist-tags');
  if (!res.ok) throw new Error(`npm registry answered ${res.status}`);
  const tags: unknown = await res.json();
  if (
    typeof tags === 'object' &&
    tags !== null &&
    'next' in tags &&
    typeof tags.next === 'string'
  ) {
    return tags.next;
  }
  throw new Error('npm registry: typescript has no next dist-tag');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const file = fileURLToPath(new URL('../pnpm-workspace.yaml', import.meta.url));
  const version = process.argv[2] ?? (await nextVersion());
  writeFileSync(file, setTypescript(readFileSync(file, 'utf8'), version));
  console.log(`typescript ${version} in catalog and catalogs.ts-next`);
}
