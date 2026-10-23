import { isVibeError } from '@usevibejs/errors';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';

const dir = fileURLToPath(new URL('..', import.meta.url));
const TSC = fileURLToPath(new URL('../../../node_modules/typescript/bin/tsc', import.meta.url));
const MACROS = [
  'defineProps',
  'defineEmits',
  'defineSlots',
  'defineModel',
  'defineExpose',
  'defineOptions',
];
const HELPERS = [
  'tags',
  'el',
  'customElement',
  'component',
  'dynamicComponent',
  'unrefs',
  'writable',
  'ctx',
  'vFor',
  'slotParams',
  'slot',
  'templateRef',
  'defineComponent',
];

it('throws VIBE5900 when dist/tooling.js is imported', async () => {
  const error: unknown = await import('@usevibejs/ui/tooling').then(
    () => undefined,
    (e: unknown) => e,
  );
  expect(isVibeError(error, 'VIBE5900')).toBe(true);
  expect(import.meta.resolve('@usevibejs/ui/tooling')).toMatch(
    /\/packages\/ui\/dist\/tooling\.js$/,
  );
});

// Node strips the types of the source entry itself (the `vibejs-source` condition), without a bundler.
it('throws VIBE5900 when Node imports src/tooling.ts', () => {
  const { stdout, stderr } = spawnSync(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      `globalThis.__DEV__ = true;
await import('./src/tooling.ts').catch((e) => console.log(e.code));`,
    ],
    { cwd: dir, encoding: 'utf8' },
  );
  expect(stderr).toBe('');
  expect(stdout.trim()).toBe('VIBE5900');
});

it('declares exactly the macros and helpers in dist/tooling.d.ts', () => {
  const dts = readFileSync(join(dir, 'dist/tooling.d.ts'), 'utf8');
  const names = new Set(
    [...dts.matchAll(/^export declare (?:function|const) (\w+)/gm)].map((m) => m[1]),
  );
  expect([...names].toSorted()).toEqual([...MACROS, ...HELPERS].toSorted());
});

it('keeps the tooling code out of dist/index.js', () => {
  const index = readFileSync(join(dir, 'dist/index.js'), 'utf8');
  expect(index).not.toContain('VIBE5900');
  expect(index).not.toContain('tooling');
});

it('types a consumer against the dist with one ComponentSignature for both entries', () => {
  const consumer = mkdtempSync(join(tmpdir(), 'vibejs-tooling-'));
  try {
    mkdirSync(join(consumer, 'node_modules/@usevibejs'), { recursive: true });
    symlinkSync(dir, join(consumer, 'node_modules/@usevibejs/ui'), 'junction');
    writeFileSync(
      join(consumer, 'tsconfig.json'),
      JSON.stringify({
        compilerOptions: {
          strict: true,
          module: 'esnext',
          moduleResolution: 'bundler',
          lib: ['es2022', 'dom'],
          types: [],
          noEmit: true,
          skipLibCheck: false,
        },
        files: ['index.ts'],
      }),
    );
    writeFileSync(
      join(consumer, 'index.ts'),
      `import type { ComponentProps, HTMLAttributes, ReservedProps } from '@usevibejs/ui';
import { defineComponent, el, tags } from '@usevibejs/ui/tooling';
const C = defineComponent<{ a: string }, { go: [n: number] }, {}, {}, {}>();
type Expected = { a: string } & { onGo?: (n: number) => void } & Omit<HTMLAttributes, 'a' | 'onGo'> & ReservedProps;
type Props = ComponentProps<typeof C>;
export const same: [Props, Expected] extends [Expected, Props] ? true : false = true;
el(tags.div)({ class: ['a'], onClick: (event) => event.clientX });
// @ts-expect-error an unknown attribute
el(tags.div)({ bogus: 1 });
`,
    );
    const { status, stdout, stderr } = spawnSync(
      process.execPath,
      [TSC, '-p', consumer, '--pretty', 'false'],
      { encoding: 'utf8' },
    );
    expect(stdout + stderr).toBe('');
    expect(status).toBe(0);
  } finally {
    rmSync(consumer, { recursive: true, force: true });
  }
});
