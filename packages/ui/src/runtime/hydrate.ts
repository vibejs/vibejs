// Attaches an app to the DOM a server render already produced.
import { vibeError } from '../errors.gen.ts';
import { waitForInstalledRouter } from '../router/router.ts';
import { isAppMounted, type App } from './app.ts';
import { hydrationFailed, startHydration, stopHydration } from './hydrateState.ts';

/**
 * Mounts `app` onto the nodes already in `container`. The server nodes stay when the client
 * render matches them. A different tag or text throws VIBE5307 and leaves `container` as it was.
 * `mount()` is unchanged: it still replaces the container.
 */
export function hydrate(app: App, container: Element): Record<string, unknown> {
  if (isAppMounted(app)) throw vibeError('VIBE5308');
  const html = container.innerHTML;
  startHydration(container);
  try {
    const exposed = app.mount(container);
    if (hydrationFailed()) {
      app.unmount();
      container.innerHTML = html;
      throw vibeError('VIBE5307');
    }
    return exposed;
  } finally {
    stopHydration();
  }
}

/**
 * Waits until the installed router's first navigation has settled, then {@link hydrate}s.
 * An app with no router hydrates on the next turn. A mounted app is VIBE5308, before the wait.
 */
export async function hydrateAsync(app: App, container: Element): Promise<Record<string, unknown>> {
  if (isAppMounted(app)) throw vibeError('VIBE5308');
  await waitForInstalledRouter(app);
  return hydrate(app, container);
}
