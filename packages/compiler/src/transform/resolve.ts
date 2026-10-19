import type { ScriptAnalysis } from '../script/analyze.ts';

/** `src/TodoList.vibe` -> `TodoList` */
export const componentName = (filename: string): string =>
  /[^/\\]*$/.exec(filename)![0].replace(/\.vibe$/, '');

/**
 * The component a template tag refers to: `tag` when it is PascalCase or dotted and its root is a
 * binding of the script, or the file's own name when no binding shadows it; else null. There are
 * no global components and no kebab-case aliases.
 */
export function resolveComponentTag(
  tag: string,
  a: ScriptAnalysis,
  filename: string,
): string | null {
  if (!/^[A-Z]/.test(tag) && !tag.includes('.')) return null;
  return a.bindings.has(tag.split('.')[0]) || tag === componentName(filename) ? tag : null;
}
