// Follows docs/guides/tutorial.md from an empty directory on an app scaffolded from the packed
// packages, one test per step (see docs/test/run-tutorial.ts).
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { cleanup, INSTALL, pack, temp } from '../../packages/create-vibejs/test/scaffold.ts';
import { tutorialRunner } from '../test/run-tutorial.ts';
import { tutorialSteps, type TutorialStep } from './tutorial.ts';

const MD = readFileSync(new URL('../guides/tutorial.md', import.meta.url), 'utf8');

let perform: (step: TutorialStep) => Promise<void>;

beforeAll(() => {
  const { tarballs } = pack();
  perform = tutorialRunner(MD, { dir: temp('vibejs-tutorial-'), tarballs });
}, INSTALL);
afterAll(cleanup, INSTALL);

it.for(tutorialSteps(MD))('step at line $mdLine: $kind', { timeout: INSTALL }, async (step) => {
  await expect(perform(step)).resolves.toBeUndefined();
});
