import type { ComponentExposed, ComponentProps } from '@vibejs-org/ui';
import { expectType } from '../../expect.ts';
import Child from './Child.vibe';

type Props = ComponentProps<typeof Child>;
expectType<string>()({} as Props['modelValue']);
expectType<((value: string) => void) | undefined>()({} as Props['onUpdate:modelValue']);
expectType<Record<string, true | undefined> | undefined>()({} as Props['modelModifiers']);
expectType<number | undefined>()({} as Props['count']);
expectType<Record<'lazy', true | undefined> | undefined>()({} as Props['countModifiers']);
expectType<{ reset: () => void; size: number }>()({} as ComponentExposed<typeof Child>);
// @ts-expect-error -- modelValue is required.
const missing: Props = {};
void missing;
