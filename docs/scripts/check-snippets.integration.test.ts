import { cpSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { main } from './check-snippets.ts';

// The real ts-next tsc on the fixture pages. guides/start.md imports the built
// @usevibejs/errors above `// ---cut---`; errors/VIBE0001.md holds a broken example.
const FIXTURE = fileURLToPath(new URL('fixtures/docs', import.meta.url));
const NODE_MODULES = fileURLToPath(new URL('../node_modules', import.meta.url));

const BROKEN = `---
title: Broken
---

# Broken

\`\`\`ts
// @ts-expect-error: a string is not a number
const expected: number = 'text';
const count: number = 'one';
\`\`\`
`;

let docs: string;
let errors: string[];

beforeEach(() => {
  docs = mkdtempSync(join(tmpdir(), 'vibejs-snippets-'));
  cpSync(FIXTURE, docs, { recursive: true });
  // Package imports resolve as they do from docs/.snippets.
  symlinkSync(NODE_MODULES, join(docs, 'node_modules'), 'junction');
  errors = [];
  vi.spyOn(console, 'error').mockImplementation((line: string) => errors.push(line));
  vi.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(() => {
  rmSync(docs, { recursive: true, force: true });
  vi.restoreAllMocks();
});

it('fails with page.md:line:col for a type error in a ts fence', { timeout: 60_000 }, () => {
  writeFileSync(join(docs, 'broken.md'), BROKEN);
  expect(main(docs)).toBe(1);
  expect(errors).toEqual([
    "broken.md:10:7 TS2322 Type 'string' is not assignable to type 'number'.",
  ]);
});

it(
  'passes the fixed page, @ts-expect-error, a cut prelude, and skips errors/',
  { timeout: 60_000 },
  () => {
    writeFileSync(join(docs, 'broken.md'), BROKEN.replace("'one'", '1'));
    expect(main(docs)).toBe(0);
    expect(errors).toEqual([]);
  },
);

const VIBE = `---
title: Vibe
---

# Vibe

\`\`\`vibe
<script setup lang="ts">
const busy: boolean = false;
const label: string = 'Save';
</script>

<template>
  <button :disabled="label">{{ label }}</button>
</template>
\`\`\`
`;

it('maps a template type error in a vibe fence to page.md:line:col', { timeout: 60_000 }, () => {
  writeFileSync(join(docs, 'vibe.md'), VIBE);
  expect(main(docs)).toBe(1);
  expect(errors).toEqual([
    "vibe.md:14:12 TS2322 Type 'string' is not assignable to type 'Booleanish | undefined'.",
  ]);
});

it('maps a script error in a vibe fence the same way', { timeout: 60_000 }, () => {
  const fixed = VIBE.replace(':disabled="label"', ':disabled="busy"');
  writeFileSync(join(docs, 'vibe.md'), fixed.replace("= 'Save'", '= 1'));
  expect(main(docs)).toBe(1);
  expect(errors).toEqual(["vibe.md:10:7 TS2322 Type 'number' is not assignable to type 'string'."]);
});

it('passes the fixed vibe fence', { timeout: 60_000 }, () => {
  writeFileSync(join(docs, 'vibe.md'), VIBE.replace(':disabled="label"', ':disabled="busy"'));
  expect(main(docs)).toBe(0);
  expect(errors).toEqual([]);
});

const IMPORTS = `---
title: Imports
---

# Imports

\`\`\`ts [theme.ts]
export const theme: string = 'light';
\`\`\`

\`\`\`vibe
<script setup lang="ts">
import { missing } from './theme.ts';
</script>

<template>
  <p>{{ missing }}</p>
</template>
\`\`\`
`;

it('checks a relative .ts import against the titled sibling fence', { timeout: 60_000 }, () => {
  writeFileSync(join(docs, 'imports.md'), IMPORTS);
  expect(main(docs)).toBe(1);
  expect(errors).toEqual([
    `imports.md:13:10 TS2305 Module '"./theme.ts"' has no exported member 'missing'.`,
  ]);
});

it('passes a relative .ts import of an exported name', { timeout: 60_000 }, () => {
  writeFileSync(join(docs, 'imports.md'), IMPORTS.replaceAll('missing', 'theme'));
  expect(main(docs)).toBe(0);
  expect(errors).toEqual([]);
});

const SLOTS = `---
title: Slots
---

# Slots

\`\`\`vibe [ItemList.vibe]
<script setup lang="ts">
defineSlots<{ default?: (props: { item: string }) => unknown }>();
const { items } = defineProps<{ items: string[] }>();
</script>

<template>
  <slot v-for="item in items" :key="item" :item="item" />
</template>
\`\`\`

\`\`\`vibe
<script setup lang="ts">
import ItemList from './ItemList.vibe';
</script>

<template>
  <ItemList :items="['a']">
    <template #default="{ item }">{{ item.toFixed() }}</template>
  </ItemList>
</template>
\`\`\`
`;

it('types the slot props of a titled sibling .vibe fence', { timeout: 60_000 }, () => {
  writeFileSync(join(docs, 'slots.md'), SLOTS);
  expect(main(docs)).toBe(1);
  expect(errors).toEqual([
    "slots.md:25:43 TS2551 Property 'toFixed' does not exist on type 'string'. Did you mean 'fixed'?",
  ]);
});
