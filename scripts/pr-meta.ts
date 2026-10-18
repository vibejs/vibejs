// Usage: PR_TITLE='feat(ui): add ref' node scripts/pr-meta.ts
// Checks the PR title, which becomes the squash-merge commit message: a Conventional Commits title
// in English. Changesets are not checked (no per-PR changesets before v0.1.0).
import { fileURLToPath } from 'node:url';
import { TURKISH } from './lint-repo.ts';

const TITLE = /^(feat|fix|perf|refactor|docs|test|build|ci|chore|revert)(\([a-z0-9-]+\))?!?: .+/;

/** Returns the problems of a PR title. */
export function checkTitle(title: string): string[] {
  const problems: string[] = [];
  if (!TITLE.test(title)) {
    problems.push(`"${title}" is not a Conventional Commits title such as "feat(ui): add ref"`);
  }
  if (TURKISH.test(title)) problems.push(`"${title}" is not English only`);
  return problems;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const problems = checkTitle(process.env.PR_TITLE ?? '');
  for (const problem of problems) console.error(`pr-meta: ${problem}`);
  process.exitCode = problems.length ? 1 : 0;
}
