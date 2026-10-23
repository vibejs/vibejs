import type { ComponentProps } from '@usevibejs/ui';
import App from './App.vibe';

export const props: ComponentProps<typeof App> = { title: 'Today', onDone: (count) => count.toFixed() };
