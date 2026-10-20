// The steps of a tutorial page, in document order: what a reader runs and writes. The tutorial
// integration test executes them, so the page and the tested scenario are one text.
import { fences } from './docs.ts';

export type TutorialStep =
  /** One line of a ```sh fence; the fence meta `exit=1` expects exit code 1. */
  | { kind: 'run'; command: string; exit: 0 | 1; mdLine: number }
  /** A ```sh line `pnpm dev` or `pnpm start`, which keeps running. */
  | { kind: 'serve'; command: string; mdLine: number }
  /** A ts, vibe or json fence titled `[relative/path]`: the full content of that file. */
  | { kind: 'write'; file: string; code: string; mdLine: number };

const SERVE = new Set(['pnpm dev', 'pnpm start']);
const WRITE = new Set(['ts', 'vibe', 'json']);

export function tutorialSteps(md: string): TutorialStep[] {
  const lines = md.split('\n');
  return fences(lines).flatMap((fence): TutorialStep[] => {
    const lang = /^[\w-]*/.exec(fence.info)![0];
    const body = lines.slice(fence.open + 1, fence.close);
    if (lang === 'sh') {
      const exit = /(?:^|\s)exit=1(?:\s|$)/.test(fence.info) ? 1 : 0;
      return body.flatMap((line, i): TutorialStep[] => {
        const command = line.trim();
        const mdLine = fence.open + i + 2;
        if (!command) return [];
        return [
          SERVE.has(command)
            ? { kind: 'serve', command, mdLine }
            : { kind: 'run', command, exit, mdLine },
        ];
      });
    }
    const file = /\[([^\]]+)\]/.exec(fence.info)?.[1];
    if (!WRITE.has(lang) || !file) return [];
    if (/^(?:[\\/]|[a-z]:)/i.test(file) || file.split(/[\\/]/).includes('..')) {
      throw new Error(`Line ${fence.open + 1}: [${file}] is not a relative path inside the app.`);
    }
    return [{ kind: 'write', file, code: `${body.join('\n')}\n`, mdLine: fence.open + 1 }];
  });
}
