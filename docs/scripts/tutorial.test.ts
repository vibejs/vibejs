import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { tutorialSteps } from './tutorial.ts';

const page = (path: string) =>
  readFileSync(new URL(`../guides/${path}.md`, import.meta.url), 'utf8');

describe('tutorialSteps', () => {
  it('returns run, serve and write steps in document order with their lines', () => {
    const md = [
      '# T', //                                     1
      '',
      '```sh',
      'pnpm create vibejs app',
      '',
      '  cd app  ',
      '```',
      '```vibe [ui/src/A.vibe]', //                8
      '<template />',
      '```',
      '```sh exit=1', //                           11
      'pnpm vibejs check',
      'pnpm start',
      '```',
      '~~~json {2} [package.json]', //             15
      '{}',
      '~~~',
      '```ts [server/src/a.ts]',
      '```',
      '```sh',
      'pnpm dev',
      '```',
    ].join('\n');
    expect(tutorialSteps(md)).toEqual([
      { kind: 'run', command: 'pnpm create vibejs app', exit: 0, mdLine: 4 },
      { kind: 'run', command: 'cd app', exit: 0, mdLine: 6 },
      { kind: 'write', file: 'ui/src/A.vibe', code: '<template />\n', mdLine: 8 },
      { kind: 'run', command: 'pnpm vibejs check', exit: 1, mdLine: 12 },
      { kind: 'serve', command: 'pnpm start', mdLine: 13 },
      { kind: 'write', file: 'package.json', code: '{}\n', mdLine: 15 },
      { kind: 'write', file: 'server/src/a.ts', code: '\n', mdLine: 18 },
      { kind: 'serve', command: 'pnpm dev', mdLine: 21 },
    ]);
  });

  it('ignores untitled code, other languages and an exit meta that is not exit=1', () => {
    const md = [
      '```ts\nconst a = 1;\n```',
      '```vibe\n<template />\n```',
      '```txt [out.txt]\nx\n```',
      '```bash\nls\n```',
      '```sh exit=10\nls\n```',
    ].join('\n');
    expect(tutorialSteps(md)).toEqual([{ kind: 'run', command: 'ls', exit: 0, mdLine: 14 }]);
  });

  it.each(['/etc/passwd', 'C:\\app\\a.ts', '\\a.ts', '../a.ts', 'ui/../../a.ts'])(
    'throws on the path %s',
    (file) => {
      expect(() => tutorialSteps(`# T\n\n\`\`\`ts [${file}]\n\`\`\``)).toThrow(
        `Line 3: [${file}] is not a relative path inside the app.`,
      );
    },
  );
});

/** The commands of a page; a run that must fail ends in ` exit=1`. */
const commands = (path: string) =>
  tutorialSteps(page(path)).flatMap((step) =>
    step.kind === 'write'
      ? []
      : [step.kind === 'run' && step.exit ? `${step.command} exit=1` : step.command],
  );

describe('the tutorial pages', () => {
  it('follow the end-to-end scenario', () => {
    const scenario = [
      'pnpm create vibejs my-app',
      'pnpm vibejs check',
      'pnpm vibejs g resource users',
      'pnpm vibejs g page Users',
      'pnpm vibejs g component UserCard',
      'pnpm vibejs check',
      'pnpm vibejs check exit=1',
      'pnpm vibejs check',
      'pnpm vibejs build',
      'pnpm start',
      'pnpm dev',
    ];
    const steps = commands('tutorial');
    // In this order, with only `cd` between them.
    expect(steps.filter((command) => !command.startsWith('cd '))).toEqual(scenario);
    // The failing check follows a write of the .vibe file whose type error it reports.
    const all = tutorialSteps(page('tutorial'));
    const failing = all.findIndex((step) => step.kind === 'run' && step.exit === 1);
    expect(all[failing - 1]).toMatchObject({
      kind: 'write',
      file: expect.stringMatching(/\.vibe$/),
    });
  });

  it('getting started runs a subset of the tutorial commands', () => {
    const tutorial = new Set(commands('tutorial'));
    const started = commands('getting-started');
    expect(started.length).toBeGreaterThan(0);
    expect(started.filter((command) => !tutorial.has(command))).toEqual([]);
  });
});
