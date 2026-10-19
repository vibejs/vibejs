import { cpSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { main } from './check-snippets.ts';

// The real ts-next tsc on the fixture pages. guides/start.md imports the built
// @vibejs-org/errors above `// ---cut---`; errors/VIBE0001.md holds a broken example.
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
