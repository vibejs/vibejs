import { createApp } from '@usevibejs/ui';
import App from './App.vibe';
import './Deps.vibe';
// Imported but never rendered: its scoped CSS stays out of the build.
import Unused from './Unused.vibe';

createApp(App).mount('#app');
