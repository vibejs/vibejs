import type { ComponentProps, HTMLAttributes, ReservedProps } from '@vibejs-org/ui';
import { expectType } from '../../expect.ts';
import Comp from './Comp.vibe';

type Expected = { title?: string; count: number } & { onPick?: (id: string) => void } & Omit<
  HTMLAttributes,
  'title' | 'count' | 'onPick'
> &
  ReservedProps;
expectType<Expected>()({} as ComponentProps<typeof Comp>);
