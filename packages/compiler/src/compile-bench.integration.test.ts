import { existsSync } from 'node:fs';
import { compile } from '@vibejs-org/compiler';
import { expect, it } from 'vitest';
import { fixtureFile, fixtures } from '../test/walk.ts';

const RUNS = 20;

// Prints compile times for the fixture corpus to the test log; never fails on timing.
it('compiles the fixture corpus', () => {
  const corpus = fixtures.filter(([name]) => existsSync(fixtureFile(name, 'output.ts')));
  const rows = corpus.map(([name, source]) => {
    const run = () =>
      compile(source, { filename: `${name}/input.vibe`, id: '0a1b2c3d', dev: true });
    expect({ name, diagnostics: run().diagnostics }).toEqual({ name, diagnostics: [] });
    const times = Array.from({ length: RUNS }, () => {
      const start = performance.now();
      run();
      return performance.now() - start;
    }).toSorted((a, b) => a - b);
    return { fixture: name, ms: times[RUNS >> 1] };
  });
  const total = rows.reduce((sum, r) => sum + r.ms, 0);
  const lines = rows.map((r) => `${r.fixture}: ${r.ms.toFixed(3)} ms`);
  process.stdout.write(
    [`${rows.length} fixtures, ${total.toFixed(3)} ms per pass (median)`, ...lines].join('\n') +
      '\n',
  );
}, 60_000);
