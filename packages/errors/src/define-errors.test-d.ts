import { expectTypeOf } from 'vitest';
import { defineErrors, type Placeholders } from './define-errors.ts';
import type { VibeError } from './vibe-error.ts';

const MESSAGES = {
  VIBE9101: ['No provider for {token} in module {module}.', 'Add {token} to providers.'],
  VIBE9102: ['The app is closed.', 'Create a new app.'],
} as const;
const vibeError = defineErrors(() => MESSAGES);

expectTypeOf<Placeholders<'a {one} b {two} c'>>().toEqualTypeOf<'one' | 'two'>();
// Codes autocomplete: the code parameter is the union of the table's keys.
expectTypeOf<Parameters<typeof vibeError>[0]>().toEqualTypeOf<'VIBE9101' | 'VIBE9102'>();
expectTypeOf(
  vibeError('VIBE9101', { token: 'DB', module: 'AppModule' }),
).toEqualTypeOf<VibeError>();
vibeError('VIBE9101', { token: 'DB', module: 1 }, { cause: new Error('x') });
vibeError('VIBE9102');

// @ts-expect-error the module placeholder arg is missing
vibeError('VIBE9101', { token: 'DB' });
// @ts-expect-error extra is not a placeholder of VIBE9101
vibeError('VIBE9101', { token: 'DB', module: 'AppModule', extra: 1 });
// @ts-expect-error tokn is a misspelled placeholder
vibeError('VIBE9101', { tokn: 'DB', module: 'AppModule' });
// @ts-expect-error VIBE9101 has placeholders, so args are required
vibeError('VIBE9101');
// @ts-expect-error VIBE9102 has no placeholders, so it takes no args
vibeError('VIBE9102', { token: 'DB' });
// @ts-expect-error VIBE9999 is not in the table (valid args, so the error is on the code)
vibeError('VIBE9999', { token: 'DB', module: 'AppModule' });
