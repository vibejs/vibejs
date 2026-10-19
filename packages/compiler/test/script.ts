import { parseSync } from 'oxc-parser';
import { expect } from 'vitest';
import { analyze, type InternalAnalysis } from '../src/script/analyze.ts';
import { compileScript, type ScriptOutput } from '../src/script/compile.ts';
import { parse } from '../src/sfc/parse.ts';
import type { SFCDescriptor } from '../src/sfc/parse.ts';

/** A file with an empty template and `code` as its `<script setup>`. */
export const vibe = (code: string): string =>
  `<template></template>\n<script setup lang="ts">\n${code}\n</script>\n`;

/** Parses a file and analyzes its script. */
export function analyzeFile(source: string): {
  descriptor: SFCDescriptor;
  analysis: InternalAnalysis;
} {
  const { descriptor } = parse(source, { filename: 'A.vibe' });
  return { descriptor, analysis: analyze(descriptor) };
}

/** Analyzes `code` as a script; asserts it has no diagnostics unless `codes` lists them. */
export function analyzeCode(code: string, codes: string[] = []): InternalAnalysis {
  const { analysis } = analyzeFile(vibe(code));
  expect(analysis.diagnostics.map((d) => d.code)).toStrictEqual(codes);
  return analysis;
}

/** The diagnostic codes of `code` as a script. */
export const codesOf = (code: string): string[] =>
  analyzeFile(vibe(code)).analysis.diagnostics.map((d) => d.code);

/** Compiles `code` as a script without diagnostics; the output must parse. */
export function compileCode(code: string): ScriptOutput & { code: string; source: string } {
  const source = vibe(code);
  const { descriptor, analysis } = analyzeFile(source);
  expect(analysis.diagnostics.map((d) => d.code)).toStrictEqual([]);
  const out = compileScript(descriptor, analysis);
  const text = out.s.toString();
  expect(parseSync('script.ts', text, { lang: 'ts' }).errors).toStrictEqual([]);
  return { ...out, code: text, source };
}
