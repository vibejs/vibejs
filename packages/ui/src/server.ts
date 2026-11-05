// Renders an app to one HTML document with the same runtime the browser mounts.
// No second compiler, no streaming, and no router: the root is a component tree.
// A page's `document` is not replaced: jsdom and browsers expose it as a non-configurable
// getter. Node has no document, so the render installs one for the call and removes it.
import { parseHTML } from 'linkedom';
import { vibeError } from './errors.gen.ts';
import { isAppMounted, type App } from './runtime/app.ts';
import { waitForInstalledRouter } from './router/router.ts';
import { SERVER_STATE_ID } from './runtime/serverState.ts';

const SHELL = '<!DOCTYPE html><html><head></head><body></body></html>';
const HEAD_ATTR = 'data-vibe-head';

/** Globals the runtime reads while it builds nodes. Restored after the string is taken. */
const DOM_GLOBALS = [
  'document',
  'Node',
  'Element',
  'Text',
  'Comment',
  'HTMLElement',
  'SVGElement',
  'DocumentFragment',
] as const;

interface Session {
  /** The element `mount()` fills. Its children are the document body. */
  root: Element;
  /** Drops the temporary document or the detached host. */
  close(): void;
}

/** Escapes text that would break a quoted attribute or a title. */
function escapeHtml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;');
}

/** One head tag, with attributes in name order so the string does not depend on the DOM. */
function elementHtml(el: Element): string {
  const attrs = [...el.attributes];
  // oxlint-disable-next-line unicorn/no-array-sort -- sorts a fresh copy; toSorted() is ES2023
  attrs.sort((a, b) => (a.name < b.name ? -1 : 1));
  const rendered = attrs.map((attr) => ` ${attr.name}="${escapeHtml(attr.value)}"`).join('');
  const tag = el.tagName.toLowerCase();
  if (tag === 'title') return `<title${rendered}>${escapeHtml(el.textContent)}</title>`;
  return `<${tag}${rendered}>`;
}

/** The head tags `useHead()` wrote, then the body, as one document. */
function serialize(root: Element): string {
  const head = [...root.ownerDocument.head.querySelectorAll(`[${HEAD_ATTR}]`)]
    .map((node) => elementHtml(node))
    .join('');
  return `<!DOCTYPE html><html><head>${head}</head><body>${root.innerHTML}</body></html>`;
}

/** Renders into the document that is already installed, without leaving nodes behind. */
function openHere(): Session {
  const root = document.createElement('div');
  const head = document.head.innerHTML;
  return {
    root,
    close() {
      root.remove();
      document.head.innerHTML = head;
    },
  };
}

/** Installs a document for a process that has none, and removes it afterwards. */
function openLinkedom(): Session {
  const window = parseHTML(SHELL);
  const previous = new Map<string, PropertyDescriptor | undefined>();
  for (const key of DOM_GLOBALS) {
    previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    const value = key === 'document' ? window.document : Reflect.get(window, key);
    Object.defineProperty(globalThis, key, {
      configurable: true,
      enumerable: true,
      writable: true,
      value,
    });
  }
  return {
    root: window.document.body,
    close() {
      for (const key of DOM_GLOBALS) {
        const descriptor = previous.get(key);
        if (descriptor) Object.defineProperty(globalThis, key, descriptor);
        else Reflect.deleteProperty(globalThis, key);
      }
    },
  };
}

/** Options for {@link renderToStringAsync}. */
export interface ServerRenderOptions {
  /**
   * A JSON value written into `#vibe-state` in the document head. `readServerState()` returns it.
   * Pass the object from `@usevibejs/query`'s `dehydrate()`. A value JSON cannot write is VIBE5309.
   */
  state?: unknown;
}

/** JSON for the head script, with `<` escaped so the value cannot close the script element. */
function stateJson(state: unknown): string {
  let json: string | undefined;
  try {
    json = JSON.stringify(state);
  } catch {
    throw vibeError('VIBE5309');
  }
  if (typeof json !== 'string') throw vibeError('VIBE5309');
  return json.replaceAll('<', '\\u003c');
}

/** Inserts the state script when `state` was passed. */
function withState(html: string, state: unknown): string {
  if (state === undefined) return html;
  const tag = `<script type="application/json" id="${SERVER_STATE_ID}">${stateJson(state)}</script>`;
  return html.replace('<head>', `<head>${tag}`);
}

/** Mounts `app` and returns the document. The caller has already waited for the router. */
function renderDocument(app: App, state?: unknown): string {
  if (isAppMounted(app)) throw vibeError('VIBE5306');
  const session = typeof document === 'undefined' ? openLinkedom() : openHere();
  try {
    app.mount(session.root);
    const html = withState(serialize(session.root), state);
    app.unmount();
    return html;
  } finally {
    session.close();
  }
}

/**
 * Mounts `app` and returns one HTML document. `useHead()` records are written into the head.
 * The app is unmounted before this returns, and it cannot be mounted again (VIBE5306).
 * Streaming HTML is a later release. This render does not wait for the router: a route's first
 * navigation is still running, so use {@link renderToStringAsync} for a routed app.
 */
export function renderToString(app: App): string {
  return renderDocument(app);
}

/**
 * Mounts `app` after its router finishes the first navigation, then returns one HTML document.
 * An app with no router renders the same tree as `renderToString()`. `options.state` is embedded
 * as JSON for `readServerState()`. There is no streamed HTML. The app cannot be mounted again
 * (VIBE5306).
 */
export async function renderToStringAsync(
  app: App,
  options?: ServerRenderOptions,
): Promise<string> {
  if (isAppMounted(app)) throw vibeError('VIBE5306');
  await waitForInstalledRouter(app);
  return renderDocument(app, options?.state);
}
