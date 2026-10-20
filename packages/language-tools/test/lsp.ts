// A small LSP client for the pinned TypeScript 7.1 language server (`tsc --lsp --stdio`). Content
// mappers run only with `initializationOptions.runExternalCode` (CONTRACTS C6).
import { spawn, type ChildProcess } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import {
  createMessageConnection,
  StreamMessageReader,
  StreamMessageWriter,
} from 'vscode-jsonrpc/node';
import { childEnv, TSC } from './corpus.ts';

export interface Lsp {
  /** The server process. */
  server: ChildProcess;
  /** didOpen with languageId 'vibejs' for .vibe, returns the uri. */
  open(file: string, text?: string): Promise<string>;
  /** A full-text didChange. */
  change(uri: string, text: string): Promise<void>;
  request<T>(method: string, params: unknown): Promise<T>;
  /** shutdown, exit, dispose, kill. */
  close(): Promise<void>;
}

export const LSP_ARGS: readonly string[] = ['--lsp', '--stdio'];
export const INIT_OPTIONS = { runExternalCode: true } as const;

const LANGUAGE: Record<string, string> = { vibe: 'vibejs', ts: 'typescript' };

/** Starts the server in `root` and initializes it (utf-16, pull diagnostics). */
export async function startLsp(
  root: string,
  options: { runExternalCode?: boolean } = { runExternalCode: true },
): Promise<Lsp> {
  const server = spawn(process.execPath, [TSC, ...LSP_ARGS], { cwd: root, env: childEnv });
  const connection = createMessageConnection(
    new StreamMessageReader(server.stdout),
    new StreamMessageWriter(server.stdin),
  );
  connection.onRequest('workspace/configuration', (params: { items: unknown[] }) =>
    params.items.map(() => null),
  );
  connection.onRequest('client/registerCapability', () => null);
  connection.listen();
  const rootUri = pathToFileURL(root).href;
  await connection.sendRequest('initialize', {
    processId: process.pid,
    rootUri,
    workspaceFolders: [{ uri: rootUri, name: 'corpus' }],
    initializationOptions: options.runExternalCode ? INIT_OPTIONS : {},
    capabilities: {
      general: { positionEncodings: ['utf-16'] },
      workspace: { configuration: true, workspaceFolders: true },
      textDocument: {
        hover: { contentFormat: ['markdown', 'plaintext'] },
        definition: { linkSupport: false },
        references: {},
        rename: { prepareSupport: true },
        completion: { completionItem: { snippetSupport: false } },
        diagnostic: { dynamicRegistration: false },
      },
    },
  });
  await connection.sendNotification('initialized', {});
  const versions = new Map<string, number>();
  return {
    server,
    async open(file, text = readFileSync(file, 'utf8')) {
      const uri = pathToFileURL(file).href;
      versions.set(uri, 1);
      const languageId = LANGUAGE[file.slice(file.lastIndexOf('.') + 1)];
      await connection.sendNotification('textDocument/didOpen', {
        textDocument: { uri, languageId, version: 1, text },
      });
      return uri;
    },
    async change(uri, text) {
      const version = versions.get(uri)! + 1;
      versions.set(uri, version);
      await connection.sendNotification('textDocument/didChange', {
        textDocument: { uri, version },
        contentChanges: [{ text }],
      });
    },
    request: (method, params) => connection.sendRequest(method, params),
    async close() {
      await connection.sendRequest('shutdown');
      await connection.sendNotification('exit');
      connection.dispose();
      server.kill();
    },
  };
}

/** 0-based UTF-16 position of `needle` (+ delta) in `text`; throws if absent. */
export function at(text: string, needle: string, delta = 0): { line: number; character: number } {
  const index = text.indexOf(needle);
  if (index < 0) throw new Error(`no ${JSON.stringify(needle)} in the text`);
  const lines = text.slice(0, index + delta).split('\n');
  return { line: lines.length - 1, character: lines.at(-1)!.length };
}
