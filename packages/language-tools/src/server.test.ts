import { PassThrough } from 'node:stream';
import {
  createMessageConnection,
  StreamMessageReader,
  StreamMessageWriter,
} from 'vscode-jsonrpc/node';
import { expect, it, onTestFinished } from 'vitest';

it('serves the protocol on stdin and stdout', async () => {
  const stdin = new PassThrough();
  const stdout = new PassThrough();
  for (const [name, stream] of [
    ['stdin', stdin],
    ['stdout', stdout],
  ] as const) {
    const descriptor = Object.getOwnPropertyDescriptor(process, name)!;
    Object.defineProperty(process, name, { value: stream, configurable: true });
    onTestFinished(() => {
      Object.defineProperty(process, name, descriptor);
    });
  }
  await import('./server.ts');
  const conn = createMessageConnection(
    new StreamMessageReader(stdout),
    new StreamMessageWriter(stdin),
  );
  conn.listen();
  await expect(conn.sendRequest('initialize', { positionEncodings: ['utf-16'] })).resolves.toEqual({
    positionEncoding: 'utf-16',
    diagnosticSource: 'VIBE',
  });
  conn.dispose();
  stdin.end();
});
