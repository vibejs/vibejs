import type { ComponentSlots } from '@usevibejs/ui';
import { expectType } from '../../expect.ts';
import Card from './Card.vibe';

declare const slots: ComponentSlots<typeof Card>;
expectType<{
  default?: (props: {}) => unknown;
  header?: (props: { title: string }) => unknown;
  item?: (props: { item: string; index: number }) => unknown;
}>()(slots);
