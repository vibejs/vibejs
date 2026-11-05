// The hydration cursor. A separate module so the app and the DOM helpers can read it
// without importing each other.

interface Cursor {
  parent: Element;
  index: number;
}

let cursor: Cursor | undefined;
let failed = false;

/** Whether `hydrate()` is currently claiming server nodes. */
export function isHydrating(): boolean {
  return cursor !== undefined;
}

/** Whether the client render disagreed with the server nodes. */
export function hydrationFailed(): boolean {
  return failed;
}

/** Records a mismatch. The render keeps the server node instead of writing over it. */
export function noteHydrationMismatch(): void {
  failed = true;
}

/**
 * The next server child whose `nodeName` is `nodeName`, or `undefined` when the server tree
 * has ended or the next child is a different node. A miss is a mismatch.
 */
export function claimHydrationNode(nodeName: string): Node | undefined {
  const current = cursor;
  const node = current?.parent.childNodes[current.index];
  if (!current || !node || node.nodeName !== nodeName) {
    failed = true;
    return undefined;
  }
  current.index += 1;
  return node;
}

/** Starts claiming the children of `parent`. */
export function startHydration(parent: Element): void {
  cursor = { parent, index: 0 };
  failed = false;
}

/** Stops claiming. Later renders write to the DOM again. */
export function stopHydration(): void {
  cursor = undefined;
  failed = false;
}
