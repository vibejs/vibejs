// The TypeScript 7.1 content-mapper protocol (JSON-RPC over stdio). TypeScript ships no JS types
// for it yet, so this file is the only part that changes when it does.
import { RequestType } from 'vscode-jsonrpc/node';
import type { SpanMapping } from './builder.ts';

export interface InitializeParams {
  locale?: string;
  positionEncodings: string[];
}
export interface InitializeResult {
  positionEncoding: 'utf-16';
  diagnosticSource: string;
}

export interface OpenProjectParams {
  configFileName: string;
  projectHandle: string;
  /** The `options` of the tsconfig `contentMappers` entry. */
  options?: Record<string, unknown>;
  compilerOptions: Record<string, unknown>;
}
export interface OpenProjectResult {
  optionDiagnostics?: { path: string[]; messageText: string; code: number }[];
}

export interface TransformParams {
  fileName: string;
  content: string;
  projectHandle: string;
}
/** Positions are UTF-16 offsets into the original content. */
interface MapperDiagnostic {
  start: number;
  length: number;
  code: number;
  messageText: string;
}
/** `[originalStart, originalLength, virtualStart, virtualEnd, policy]`; policy 1 is Expect. */
type DiagnosticDirective = [number, number, number, number, 1];
interface DiagnosticDirectives {
  directives: DiagnosticDirective[];
  /** Reported at a directive's original range when it suppresses nothing. */
  unusedExpectDirectiveDiagnostics: { code: number; messageText: string }[];
}
export interface TransformResult {
  text: string;
  extension: '.ts';
  mappings?: SpanMapping[];
  diagnosticDirectives?: DiagnosticDirectives;
  diagnostics: MapperDiagnostic[];
}

export interface CloseProjectParams {
  projectHandle: string;
}

export const initialize: RequestType<InitializeParams, InitializeResult, void> = new RequestType(
  'initialize',
);
export const openProject: RequestType<OpenProjectParams, OpenProjectResult, void> = new RequestType(
  'openProject',
);
export const transform: RequestType<TransformParams, TransformResult, void> = new RequestType(
  'transform',
);
export const closeProject: RequestType<CloseProjectParams, null, void> = new RequestType(
  'closeProject',
);
