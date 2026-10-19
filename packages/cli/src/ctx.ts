import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { detectAgent } from 'std-env';
import manifest from '../package.json' with { type: 'json' };

export interface ExecResult {
  code: number;
  stdout: string;
  stderr: string;
}

export interface Ctx {
  version: string;
  agent: { active: boolean; name?: string };
  /** The bundled docs (`dist/docs`); it may not exist. */
  docsDir: string;
  cwd: string;
  /** Milliseconds from a monotonic clock. */
  now(): number;
  /** Runs a program; never rejects, a failure to start is a non-zero `code`. */
  exec(file: string, args: string[], options: { cwd: string }): Promise<ExecResult>;
  out(s: string): void;
  err(s: string): void;
  /** Resolves with the name of the first `SIGINT` or `SIGTERM` after the call. */
  untilSignal(): Promise<string>;
}

/** `VIBEJS_AGENT=1` forces agent mode on, `VIBEJS_AGENT=0` off; otherwise std-env decides. */
// No env parameter: std-env's detectAgent() reads process.env when called (and honors AI_AGENT).
export function detectAgentMode(): Ctx['agent'] {
  const forced = process.env.VIBEJS_AGENT;
  if (forced === '0') return { active: false };
  const { name } = detectAgent();
  return { active: forced === '1' || name !== undefined, name };
}

export function nodeCtx(): Ctx {
  return {
    version: manifest.version,
    agent: detectAgentMode(),
    // From src/ and from dist/bin.js alike.
    docsDir: fileURLToPath(new URL('../dist/docs', import.meta.url)),
    cwd: process.cwd(),
    now: () => performance.now(),
    exec: (file, args, { cwd }) =>
      new Promise((resolve) => {
        execFile(file, args, { cwd, maxBuffer: 64 * 1024 * 1024 }, (error, stdout, stderr) => {
          // A spawn error has a string code (ENOENT), a killed child a null one.
          resolve({ code: error ? Number(error.code) || 1 : 0, stdout, stderr });
        });
      }),
    out: (s) => process.stdout.write(s),
    err: (s) => process.stderr.write(s),
    untilSignal: () =>
      new Promise((resolve) => {
        const on = (signal: string) => {
          process.off('SIGINT', on).off('SIGTERM', on);
          resolve(signal);
        };
        process.once('SIGINT', on).once('SIGTERM', on);
      }),
  };
}
