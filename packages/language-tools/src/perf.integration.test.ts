// The time budgets of the content mapper; each test prints its measurement. generate() is timed in
// CPU time of this thread, so the test files that run in parallel (tsc) do not skew it.
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import {
  createMessageConnection,
  StreamMessageReader,
  StreamMessageWriter,
} from 'vscode-jsonrpc/node';
import { expect, it, onTestFinished } from 'vitest';
import { compiler, typecheck } from '../test/fixtures.ts';
import { generate } from './generate.ts';

const LARGE = readFileSync(new URL('../test/fixtures/perf/Large.vibe', import.meta.url), 'utf8');
const SERVER = fileURLToPath(new URL('../dist/server.js', import.meta.url));

const print = (line: string) => process.stdout.write(`${line}\n`);

/** The CPU milliseconds that `body` takes on this thread. */
function time(body: () => void): number {
  const { user, system } = process.threadCpuUsage();
  body();
  const end = process.threadCpuUsage();
  return (end.user - user + end.system - system) / 1000;
}

it('generates Large.vibe with a p95 under 5 ms', () => {
  expect(LARGE.split('\n')).toHaveLength(301);
  for (let i = 0; i < 100; i++) generate('Large.vibe', LARGE);
  const runs = Array.from({ length: 500 }, () => time(() => generate('Large.vibe', LARGE)));
  const sorted = runs.toSorted((a, b) => a - b);
  const p95 = sorted[Math.ceil(500 * 0.95) - 1];
  const median = sorted[250];
  print(`generate() on Large.vibe: p95 ${p95.toFixed(2)} ms, median ${median.toFixed(2)} ms CPU`);
  expect(p95).toBeLessThan(5);
});

it('runs 500 generate() calls over the corpus and compiler fixtures in under 1 s', () => {
  const files = [...typecheck, ...compiler];
  const total = time(() => {
    for (let i = 0; i < 500; i++) generate(...files[i % files.length]);
  });
  print(`500 generate() calls: ${total.toFixed(0)} ms CPU`);
  expect(total).toBeLessThan(1000);
});

it('answers initialize within 1 s of spawning the server', async () => {
  const start = performance.now();
  const child = spawn(process.execPath, [SERVER], { stdio: ['pipe', 'pipe', 'inherit'] });
  const conn = createMessageConnection(
    new StreamMessageReader(child.stdout),
    new StreamMessageWriter(child.stdin),
  );
  onTestFinished(() => {
    conn.dispose();
    child.kill();
  });
  conn.listen();
  await conn.sendRequest('initialize', { positionEncodings: ['utf-16'] });
  const elapsed = performance.now() - start;
  print(`server spawn to initialize reply: ${elapsed.toFixed(0)} ms`);
  expect(elapsed).toBeLessThan(1000);
});
