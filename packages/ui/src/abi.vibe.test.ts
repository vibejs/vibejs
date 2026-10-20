// @vitest-environment jsdom
// Runs each shared ABI suite on its `.vibe` twin, compiled by the built vibe().
import { globSync } from 'node:fs';
import { basename } from 'node:path';
import type { ComponentDef } from '@vibejs-org/ui/internal';
import { expect, test } from 'vitest';
import type { AbiSuite } from '../test/abi/suite.ts';
import Card from '../test/abi/Card.vibe';
import { CardSuite } from '../test/abi/Card.suite.ts';
import Counter from '../test/abi/Counter.vibe';
import { CounterSuite } from '../test/abi/Counter.suite.ts';
import Dynamic from '../test/abi/Dynamic.vibe';
import { DynamicSuite } from '../test/abi/Dynamic.suite.ts';
import Fallthrough from '../test/abi/Fallthrough.vibe';
import { FallthroughSuite } from '../test/abi/Fallthrough.suite.ts';
import Form from '../test/abi/Form.vibe';
import { FormSuite } from '../test/abi/Form.suite.ts';
import Hmr from '../test/abi/Hmr.vibe';
import { HmrSuite } from '../test/abi/Hmr.suite.ts';
import Lifecycle from '../test/abi/Lifecycle.vibe';
import { LifecycleSuite } from '../test/abi/Lifecycle.suite.ts';
import List from '../test/abi/List.vibe';
import { ListSuite } from '../test/abi/List.suite.ts';
import Provide from '../test/abi/Provide.vibe';
import { ProvideSuite } from '../test/abi/Provide.suite.ts';
import Refs from '../test/abi/Refs.vibe';
import { RefsSuite } from '../test/abi/Refs.suite.ts';
import ScopedRoot from '../test/abi/ScopedRoot.vibe';
import { ScopedRootSuite } from '../test/abi/ScopedRoot.suite.ts';

const runs: [AbiSuite, ComponentDef][] = [
  [CounterSuite, Counter],
  [ListSuite, List],
  [FormSuite, Form],
  [CardSuite, Card],
  [FallthroughSuite, Fallthrough],
  [ScopedRootSuite, ScopedRoot],
  [DynamicSuite, Dynamic],
  [RefsSuite, Refs],
  [ProvideSuite, Provide],
  [LifecycleSuite, Lifecycle],
  [HmrSuite, Hmr],
];

for (const [suite, def] of runs) suite.run(() => def);

test('every ABI suite runs on its compiled twin', () => {
  // Relative to the repo root: under jsdom, `import.meta.url` is not a file URL.
  const files = globSync('packages/ui/test/abi/*.suite.ts');
  const names = files.map((f) => basename(f, '.suite.ts')).toSorted();
  expect(runs.map(([s]) => s.name).toSorted()).toEqual(names);
});
