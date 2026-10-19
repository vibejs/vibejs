import type { VibeError } from '@vibejs-org/errors';
import { ErrorCodes, ResponseError, type MessageConnection } from 'vscode-jsonrpc/node';
import { vibeError } from './errors.gen.ts';
import { generate } from './generate.ts';
import { closeProject, initialize, openProject, transform } from './protocol.ts';

/** The catalog text of an error on one line, without its `[VIBE####] ` prefix. */
const text = (error: VibeError) =>
  error.message.slice(error.code.length + 3).replace(/\n\s*/g, ' ');

/**
 * Serves the content-mapper protocol on `conn`. Stateless: `projectHandle` is accepted and
 * unused. Requests are handled one at a time; `generate()` is synchronous.
 */
export function listen(conn: MessageConnection): void {
  conn.onRequest(initialize, ({ positionEncodings }) => {
    if (!positionEncodings.includes('utf-16')) {
      throw new ResponseError(ErrorCodes.InvalidParams, text(vibeError('VIBE6002')));
    }
    return { positionEncoding: 'utf-16', diagnosticSource: 'VIBE' };
  });
  conn.onRequest(openProject, ({ options }) => {
    const keys = Object.keys(options ?? {});
    if (keys.length === 0) return {};
    return {
      optionDiagnostics: keys.map((option) => ({
        path: [option],
        messageText: text(vibeError('VIBE6001', { option })),
        code: 6001,
      })),
    };
  });
  conn.onRequest(transform, ({ fileName, content }) => {
    try {
      const file = generate(fileName, content);
      return {
        text: file.text,
        extension: '.ts',
        mappings: file.spans,
        diagnostics: file.diagnostics.map(({ message, ...d }) => ({ ...d, messageText: message })),
      };
    } catch (error) {
      const reason = String(error);
      const messageText = text(vibeError('VIBE6090', { reason }));
      return {
        text: 'export {}',
        extension: '.ts',
        diagnostics: [{ start: 0, length: 0, code: 6090, messageText }],
      };
    }
  });
  conn.onRequest(closeProject, () => null);
  conn.listen();
}
