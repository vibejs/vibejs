import { VibeFactory } from '@usevibejs/server';
import { AppModule, appOptions } from './app.module.ts';

const app = await VibeFactory.create(AppModule, {
  ...appOptions,
  static: { root: 'ui/dist', spa: true },
});
app.enableShutdownHooks();
await app.listen(Number(process.env.PORT ?? 3000));
