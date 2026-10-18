import { fileURLToPath } from 'node:url';
import { detectAgent } from 'std-env';
import manifest from '../package.json' with { type: 'json' };

export interface Ctx {
  version: string;
  agent: { active: boolean; name?: string };
  /** The bundled docs (`dist/docs`); it may not exist. */
  docsDir: string;
  out(s: string): void;
  err(s: string): void;
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
    out: (s) => process.stdout.write(s),
    err: (s) => process.stderr.write(s),
  };
}
