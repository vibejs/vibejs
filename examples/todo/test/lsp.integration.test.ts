// Drives the TypeScript 7.1 language server over the app, as the editor does: content mappers run
// only with `initializationOptions.runExternalCode`.
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  createMessageConnection,
  StreamMessageReader,
  StreamMessageWriter,
} from 'vscode-jsonrpc/node';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { APP } from './app.ts';

interface Position {
  line: number;
  character: number;
}
interface Range {
  start: Position;
  end: Position;
}

const TSC = createRequire(join(APP, 'package.json'))
  .resolve('typescript/package.json')
  .replace(/package\.json$/, 'bin/tsc');
const PAGE = join(APP, 'ui/src/pages/TodosPage.vibe');
const uri = pathToFileURL(PAGE).href;
const source = readFileSync(PAGE, 'utf8');

const server = spawn(process.execPath, [TSC, '--lsp', '--stdio'], { cwd: APP });
const connection = createMessageConnection(
  new StreamMessageReader(server.stdout),
  new StreamMessageWriter(server.stdin),
);
connection.onRequest('workspace/configuration', (params: { items: unknown[] }) =>
  params.items.map(() => null),
);
connection.listen();

/** The 0-based position of `needle` in `text`, moved by `delta` characters. */
function at(text: string, needle: string, delta = 0): Position {
  const index = text.indexOf(needle);
  expect(index).toBeGreaterThanOrEqual(0);
  const lines = text.slice(0, index + delta).split('\n');
  return { line: lines.length - 1, character: lines.at(-1)!.length };
}

beforeAll(async () => {
  await connection.sendRequest('initialize', {
    processId: process.pid,
    rootUri: pathToFileURL(APP).href,
    workspaceFolders: [{ uri: pathToFileURL(APP).href, name: 'todo' }],
    initializationOptions: { runExternalCode: true },
    capabilities: {
      general: { positionEncodings: ['utf-16'] },
      workspace: { configuration: true, workspaceFolders: true },
      textDocument: {
        hover: { contentFormat: ['markdown', 'plaintext'] },
        definition: { linkSupport: false },
        diagnostic: { dynamicRegistration: false },
      },
    },
  });
  await connection.sendNotification('initialized', {});
  await connection.sendNotification('textDocument/didOpen', {
    textDocument: { uri, languageId: 'vibejs', version: 1, text: source },
  });
}, 60_000);

afterAll(async () => {
  await connection.sendRequest('shutdown');
  await connection.sendNotification('exit');
  connection.dispose();
  server.kill();
});

it('types the result of useFlag in a template as boolean on hover', async () => {
  const hover = await connection.sendRequest<{ contents: { value: string } }>(
    'textDocument/hover',
    { textDocument: { uri }, position: at(source, 'v-if="canRemoveDone"', 7) },
  );
  expect(hover.contents.value).toMatch(/canRemoveDone: boolean/);
}, 60_000);

it('goes from a template binding to its <script setup> declaration', async () => {
  const definition = await connection.sendRequest<{ uri: string; range: Range }[]>(
    'textDocument/definition',
    { textDocument: { uri }, position: at(source, 'toggle(todo.id)', 1) },
  );
  const start = at(source, 'function toggle', 9);
  expect(definition).toContainEqual({
    uri,
    range: { start, end: { ...start, character: start.character + 'toggle'.length } },
  });
}, 60_000);

it('pulls a diagnostic for a type error seeded in the template', async () => {
  const seeded = source.replace('{{ todo.title }}', '{{ todo.title.toFixed(1) }}');
  await connection.sendNotification('textDocument/didChange', {
    textDocument: { uri, version: 2 },
    contentChanges: [{ text: seeded }],
  });
  const report = await connection.sendRequest<{
    items: { code: number; range: Range }[];
  }>('textDocument/diagnostic', { textDocument: { uri } });
  const start = at(seeded, 'toFixed');
  expect(report.items).toEqual([
    expect.objectContaining({
      code: 2551,
      range: { start, end: { ...start, character: start.character + 'toFixed'.length } },
    }),
  ]);
}, 60_000);
