import type { Plugin } from 'vite';
import { expectTypeOf } from 'vitest';
import { vibe } from './vite.ts';

expectTypeOf(vibe).toEqualTypeOf<() => Plugin>();
