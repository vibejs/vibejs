import type { ComponentProps } from '@vibejs-org/ui';
import App from './App.vibe';

export const props: ComponentProps<typeof App> = { title: 'Today', onDone: (count) => count.toFixed() };
