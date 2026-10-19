import { PassThrough } from 'node:stream';
import {
  createMessageConnection,
  ErrorCodes,
  ResponseError,
  StreamMessageReader,
  StreamMessageWriter,
  type MessageConnection,
} from 'vscode-jsonrpc/node';
import { afterEach, expect, it, vi } from 'vitest';
import { generate } from './generate.ts';
import { listen } from './mapper.ts';

vi.mock(import('./generate.ts'), { spy: true });

const connections: MessageConnection[] = [];
afterEach(() => {
  for (const c of connections.splice(0)) c.dispose();
});

/** A client connected to `listen()` over two in-memory streams. */
function client(): MessageConnection {
  const up = new PassThrough();
  const down = new PassThrough();
  const server = createMessageConnection(
    new StreamMessageReader(up),
    new StreamMessageWriter(down),
  );
  listen(server);
  const conn = createMessageConnection(new StreamMessageReader(down), new StreamMessageWriter(up));
  conn.listen();
  connections.push(server, conn);
  return conn;
}

const rejection = (promise: Promise<unknown>) =>
  promise.then(
    () => undefined,
    (e: unknown) => e,
  );

it('chooses utf-16 and the VIBE source, with or without a locale and unknown fields', async () => {
  const c = client();
  const result = { positionEncoding: 'utf-16', diagnosticSource: 'VIBE' };
  await expect(
    c.sendRequest('initialize', { positionEncodings: ['utf-8', 'utf-16'] }),
  ).resolves.toEqual(result);
  const params = { locale: 'en', positionEncodings: ['utf-16'], capabilities: {} };
  await expect(c.sendRequest('initialize', params)).resolves.toEqual(result);
});

it('rejects a host without utf-16 with VIBE6002', async () => {
  const error = await rejection(
    client().sendRequest('initialize', { positionEncodings: ['utf-8'] }),
  );
  expect(error).toBeInstanceOf(ResponseError);
  expect(error).toMatchObject({
    code: ErrorCodes.InvalidParams,
    message: expect.stringMatching(/^The TypeScript host does not offer UTF-16 positions/),
  });
  expect(String(error)).toContain('VIBE6002');
});

it('opens a project without state or config identity, and reports VIBE6001 per option', async () => {
  const c = client();
  const project = { configFileName: '/p/tsconfig.json', projectHandle: 'p:0', compilerOptions: {} };
  await expect(c.sendRequest('openProject', project)).resolves.toEqual({});
  await expect(c.sendRequest('openProject', { ...project, options: {} })).resolves.toEqual({});
  const result = await c.sendRequest('openProject', {
    ...project,
    options: { strict: true, x: 1 },
  });
  expect(result).not.toHaveProperty('configIdentity');
  expect(result).toEqual({
    optionDiagnostics: ['strict', 'x'].map((option) => ({
      path: [option],
      messageText: expect.stringContaining(`sets \`${option}\``),
      code: 6001,
    })),
  });
  expect(JSON.stringify(result)).toContain('VIBE6001');
});

it('transforms a file to .ts with mappings and forwarded diagnostics', async () => {
  const content = '<template><div id="a" id="b">{{ x }}</div></template>\n';
  const file = generate('/p/A.vibe', content);
  const result = await client().sendRequest('transform', {
    fileName: '/p/A.vibe',
    content,
    projectHandle: 'p:0',
  });
  expect(result).toEqual({
    text: file.text,
    extension: '.ts',
    mappings: file.spans,
    diagnostics: [{ code: 1102, messageText: file.diagnostics[0].message, start: 22, length: 6 }],
  });
});

it('falls back to an empty module with VIBE6090 when generate throws', async () => {
  vi.mocked(generate).mockImplementationOnce(() => {
    throw new TypeError('boom');
  });
  const result = await client().sendRequest('transform', {
    fileName: '/p/A.vibe',
    content: '',
    projectHandle: 'p:0',
  });
  expect(result).toEqual({
    text: 'export {}',
    extension: '.ts',
    diagnostics: [
      {
        start: 0,
        length: 0,
        code: 6090,
        messageText: expect.stringMatching(
          /^The content mapper failed on this file: TypeError: boom .*VIBE6090$/,
        ),
      },
    ],
  });
  expect(JSON.stringify(result)).toContain('VIBE6090');
});

it('closes a project with null and answers an unknown request with MethodNotFound', async () => {
  const c = client();
  await expect(c.sendRequest('closeProject', { projectHandle: 'p:0' })).resolves.toBeNull();
  const error = await rejection(c.sendRequest('bogus', {}));
  expect(error).toMatchObject({ code: ErrorCodes.MethodNotFound });
});
