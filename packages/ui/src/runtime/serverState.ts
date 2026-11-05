// The JSON document a server render embeds for the client. The query cache is one such value.
import { vibeError } from '../errors.gen.ts';

/** The id of the `<script type="application/json">` that carries the server state. */
export const SERVER_STATE_ID = 'vibe-state';

/**
 * The value embedded by `renderToStringAsync()`, or `undefined` when the document has none.
 * Invalid JSON is VIBE5310. `root` defaults to the current document.
 */
export function readServerState(root: ParentNode = document): unknown {
  const node = root.querySelector(`#${SERVER_STATE_ID}`);
  if (!node) return undefined;
  const text = node.textContent || '';
  try {
    return JSON.parse(text);
  } catch {
    throw vibeError('VIBE5310');
  }
}
