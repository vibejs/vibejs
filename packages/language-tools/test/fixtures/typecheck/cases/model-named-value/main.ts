import type { ComponentProps } from '@vibejs-org/ui';
import { expectType } from '../../expect.ts';
import Child from './Child.vibe';

type Props = ComponentProps<typeof Child>;
expectType<string>()({} as Props['modelValue']);
expectType<((value: string) => void) | undefined>()({} as Props['onUpdate:modelValue']);
expectType<string>()({} as Parameters<NonNullable<Props['onUpdate:modelValue']>>[0]);
