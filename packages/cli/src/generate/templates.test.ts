import { readFileSync } from 'node:fs';
import { format } from 'oxfmt';
import { expect, it } from 'vitest';
import { names, type GeneratorKind } from './plan.ts';
import { files, hyphenate, pageRoute } from './templates.ts';

const config = JSON.parse(
  readFileSync(
    new URL('../../../create-vibejs/templates/fullstack/.oxfmtrc.json', import.meta.url),
    'utf8',
  ),
);

const CASES: [GeneratorKind, string, string?][] = [
  ['resource', 'users'],
  ['resource', 'blogPosts'],
  ['resource', 'people', 'person'],
  ['component', 'UserCard'],
  ['component', 'ProfileSettingsPanel'],
  ['page', 'Users'],
  ['page', 'AccountSettings'],
];

it.each(CASES)(
  'writes %s %s unchanged by oxfmt with the template config',
  async (kind, name, s) => {
    for (const [path, content] of Object.entries(files(kind, names(kind, name, s)))) {
      // oxfmt formats a .vibe file as the single-file component it is.
      const r = await format(path.replace(/\.vibe$/, '.vue'), content, config);
      expect({ path, errors: r.errors, code: r.code }).toEqual({ path, errors: [], code: content });
    }
  },
);

it.each([
  ['resource', 'users'],
  ['component', 'UserCard'],
  ['page', 'Users'],
] as const)('snapshots the files of %s %s', (kind, name) => {
  expect(files(kind, names(kind, name))).toMatchSnapshot();
});

it('hyphenates names for paths and CSS classes', () => {
  expect(['users', 'blogPosts', 'UserCard', 'Page2Title'].map(hyphenate)).toEqual([
    'users',
    'blog-posts',
    'user-card',
    'page2-title',
  ]);
  expect(pageRoute('AccountSettingsPage')).toEqual({
    title: 'AccountSettings',
    path: '/account-settings',
  });
});
