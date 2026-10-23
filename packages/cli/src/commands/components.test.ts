import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { compilerSrc, copyApp, installCompiler, testCtx } from '../../test/app.ts';
import { main } from '../main.ts';
import { exitCode } from '../output.ts';
import { components, type ComponentInfo, type ComponentsResult } from './components.ts';

// Transforming the compiler tree once, here, keeps it out of the first test's timeout.
beforeAll(() => import(pathToFileURL(compilerSrc).href), 60_000);

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

const FILES: Record<string, string> = {
  'ui/src/components/Card.vibe': `<script setup lang="ts">
const { title: heading, count = 1 } = defineProps<{ title: string; count?: number }>();
const emit = defineEmits<{ save: [id: number] }>();
defineSlots<{ default(props: { heading: string }): unknown }>();
const open = defineModel<boolean>('open');
const value = defineModel<string>({ required: true });
</script>

<template>
  <section @click="emit('save', count)">{{ heading }} {{ open }} {{ value }}<slot :heading="heading" /></section>
</template>
`,
  'ui/src/Plain.vibe': '<template><p>Plain</p></template>\n',
  // Running this script would throw; listing it must not run it.
  'ui/src/pages/HomePage.vibe': `<script setup lang="ts">
throw new Error('ran');
</script>

<template><h1>Home</h1></template>
`,
  'ui/src/Broken.vibe': '<template><div></template>\n',
  // A directory named like a component is not one.
  'ui/src/Folder.vibe/inner.ts': 'export {};\n',
  // Outside ui/src, so not listed.
  'server/src/Other.vibe': '<template><p /></template>\n',
};

/** A copy of the fixture app with the workspace compiler and FILES. */
function app(): string {
  const root = copyApp();
  roots.push(root);
  installCompiler(root);
  for (const [file, text] of Object.entries(FILES)) {
    mkdirSync(dirname(join(root, file)), { recursive: true });
    writeFileSync(join(root, file), text);
  }
  return root;
}

const run = (root: string, values: Record<string, string> = {}) =>
  components.run({ values, positionals: [] }, testCtx(root).ctx);

describe('the components command', () => {
  it('lists every component in path order without running it', async () => {
    const r = await run(app());
    expect(r.ok).toBe(true);
    expect(r.next).toEqual(['vibejs check --json']);
    expect(r.components).toMatchSnapshot();
    expect(r.components.map((c) => c.file)).toEqual([
      'ui/src/Broken.vibe',
      'ui/src/Plain.vibe',
      'ui/src/components/Card.vibe',
      'ui/src/pages/HomePage.vibe',
    ]);
    const card: ComponentInfo = {
      name: 'Card',
      file: 'ui/src/components/Card.vibe',
      props: ['title', 'count', 'open', 'openModifiers', 'modelValue', 'modelValueModifiers'],
      models: ['open', 'modelValue'],
      types: {
        props: '{ title: string; count?: number }',
        emits: '{ save: [id: number] }',
        slots: '{ default(props: { heading: string }): unknown }',
      },
      diagnostics: [],
    };
    expect(r.components[2]).toEqual(card);
    expect(r.components[0].diagnostics).toEqual(['VIBE1124']);
    expect(r.components.slice(1).map((c) => c.diagnostics)).toEqual([[], [], []]);
    expect(exitCode(r)).toBe(0);
  });

  it.each([
    ['Card', ['ui/src/components/Card.vibe'], undefined],
    ['Plain', ['ui/src/Plain.vibe'], undefined],
    ['card', [], ['vibejs components']],
    ['Folder', [], ['vibejs components']],
  ])('--name %s keeps exact matches', async (name, files, next) => {
    const r = await run(app(), { name });
    expect(r.ok).toBe(true);
    expect(r.components.map((c) => c.file)).toEqual(files);
    expect(r.next).toEqual(next);
  });

  it('gives no next step when a project has no components', async () => {
    const root = copyApp();
    roots.push(root);
    installCompiler(root);
    const r = await run(root);
    expect(r).toMatchObject({ ok: true, components: [] });
    expect(r.next).toBeUndefined();
  });

  it('reports VIBE8005 when the project has no compiler', async () => {
    const root = copyApp();
    roots.push(root);
    const r = await run(root);
    expect(r).toMatchObject({ ok: false, error: { code: 'VIBE8005' }, components: [] });
    expect(r.error!.fixes).toEqual([
      'Run `npm install -D @usevibejs/compiler` in the project root.',
    ]);
    expect(exitCode(r)).toBe(2);
  });

  it('reports VIBE8001 outside a project', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'vibejs-components-'));
    roots.push(dir);
    const r = await run(dir);
    expect(r).toMatchObject({ ok: false, error: { code: 'VIBE8001' }, components: [] });
    expect(exitCode(r)).toBe(2);
  });
});

describe('output', () => {
  it('prints one block per component for people', async () => {
    const t = testCtx(app(), false);
    expect(await main(['components'], t.ctx)).toBe(0);
    expect(t.out.join('')).toMatchSnapshot();
    const none = testCtx(t.ctx.cwd, false);
    expect(await main(['components', '--name', 'Nope'], none.ctx)).toBe(0);
    expect(none.out.join('')).toBe('No component matches.\n');
  });

  it('answers --help as JSON and as text', async () => {
    const json = testCtx(process.cwd());
    expect(await main(['components', '--help', '--json'], json.ctx)).toBe(0);
    const help: ComponentsResult = JSON.parse(json.out.join(''));
    expect(help).toMatchObject({ ok: true, command: 'help' });
    const text = testCtx(process.cwd(), false);
    await main(['components', '--help'], text.ctx);
    expect(text.out.join('')).toMatchSnapshot();
  });
});
