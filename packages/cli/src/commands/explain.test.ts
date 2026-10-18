import { expect, it, vi } from 'vitest';
import type { CatalogEntry } from '../catalog.gen.ts';
import type { Ctx } from '../ctx.ts';
import { entryMarkdown, explain, lookup } from './explain.ts';

const ctx: Ctx = {
  version: '1.2.3',
  agent: { active: true },
  docsDir: '',
  out: vi.fn<Ctx['out']>(),
  err: vi.fn<Ctx['err']>(),
};
const run = (code: string) => explain.run({ values: {}, positionals: [code] }, ctx);

const retired: CatalogEntry = {
  code: 'VIBE0001',
  package: 'errors',
  title: 'Old error',
  message: 'Old message.',
  fixes: ['Do the new thing.'],
  body: '',
  docs: 'https://vibejs.org/v0/errors/VIBE0001',
  retired: true,
};

it('looks a code up in any case, retired entries included', () => {
  expect(lookup('vibe0001', [retired])).toBe(retired);
  expect(lookup('VIBE0002', [retired])).toBeUndefined();
});

it('returns the catalog entry of a known code', async () => {
  const r = await run('vibe8003');
  expect(r).toMatchObject({ ok: true, command: 'explain', version: '1.2.3' });
  expect(r.entry).toMatchObject({ code: 'VIBE8003', retired: false });
});

it('returns VIBE8008 with the upper-case code for a code that is not in the catalog', async () => {
  expect(await run('vibe0000')).toEqual({
    ok: false,
    command: 'explain',
    version: '1.2.3',
    error: expect.objectContaining({
      code: 'VIBE8008',
      message: 'No error code `VIBE0000` in the catalog of this vibejs version.',
    }),
  });
});

it('renders an entry as Markdown', async () => {
  expect(explain.human(await run('VIBE8008'))).toMatchInlineSnapshot(`
    "# VIBE8008: Unknown error code

    > No error code \`{code}\` in the catalog of this vibejs version.

    \`vibejs explain\` and \`vibejs docs\` read the error catalog that ships with the installed CLI, so they work offline. A code is missing when it is mistyped or when it comes from a newer vibe.js version than the installed one.

    ## Fix

    - Check the spelling: a code is \`VIBE\` followed by four digits.
    - Update the vibe.js packages in this project if the code comes from a newer version.

    Docs: https://vibejs.org/v0/errors/VIBE8008"
  `);
});

it('marks a retired entry and skips an empty body', () => {
  expect(entryMarkdown(retired)).toBe(
    [
      '# VIBE0001: Old error (retired)',
      '',
      '> Old message.',
      '',
      '## Fix',
      '',
      '- Do the new thing.',
      '',
      'Docs: https://vibejs.org/v0/errors/VIBE0001',
    ].join('\n'),
  );
});
