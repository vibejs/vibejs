import type { MaybeRefOrGetter } from '../reactivity/ref.ts';
import { toValue } from '../reactivity/ref.ts';
import { onScopeDispose } from '../reactivity/effectScope.ts';
import type { App, Plugin } from './app.ts';
import { hasInjectionContext, inject, type InjectionKey } from './inject.ts';
import { watchSyncEffect } from './watch.ts';

/** One tag a future server render can write. `text` is set for `title`. */
export interface HeadTag {
  readonly tag: 'title' | 'meta' | 'link';
  readonly props: Readonly<Record<string, string>>;
  readonly text?: string;
}

/** The title, meta, and link tags one `useHead()` contributes. */
export interface HeadInput {
  readonly title?: string;
  readonly meta?: readonly Readonly<Record<string, unknown>>[];
  readonly link?: readonly Readonly<Record<string, unknown>>[];
}

/** The tags currently contributed, and the place `useHead()` registers more. */
export interface Head {
  /** The tags that would be written, in order, after later entries replace earlier ones. */
  tags(): readonly HeadTag[];
  /** Registers `input` until the active scope stops, and applies it in the browser. */
  use(input: MaybeRefOrGetter<HeadInput>): void;
}

const HEAD: InjectionKey<Head> = Symbol('vibe-head');
const MARK = 'data-vibe-head';

let active: Head | undefined;

/** String attributes. Anything other than a string or a number is omitted. */
function propsOf(record: Readonly<Record<string, unknown>>): Record<string, string> {
  const props: Record<string, string> = {};
  for (const [key, value] of Object.entries(record)) {
    if (typeof value === 'string') props[key] = value;
    else if (typeof value === 'number') props[key] = String(value);
  }
  return props;
}

function own(props: Readonly<Record<string, string>>, key: string): string | undefined {
  return Object.hasOwn(props, key) ? props[key] : undefined;
}

function metaKey(props: Readonly<Record<string, string>>): string {
  return (
    own(props, 'name') ??
    own(props, 'property') ??
    own(props, 'http-equiv') ??
    own(props, 'id') ??
    JSON.stringify(props)
  );
}

interface Entry {
  key: string;
  props: Record<string, string>;
}

function upsert(list: Entry[], key: string, props: Record<string, string>): void {
  const index = list.findIndex((item) => item.key === key);
  const entry = { key, props };
  if (index >= 0) list[index] = entry;
  else list.push(entry);
}

/** The tags `inputs` produce: the last title, and the last meta or link for each key. */
function resolve(inputs: readonly HeadInput[]): HeadTag[] {
  let title: string | undefined;
  const metas: Entry[] = [];
  const links: Entry[] = [];
  for (const input of inputs) {
    if (input.title !== undefined) title = input.title;
    for (const meta of input.meta ?? []) {
      const props = propsOf(meta);
      upsert(metas, metaKey(props), props);
    }
    for (const link of input.link ?? []) {
      const props = propsOf(link);
      upsert(links, `${own(props, 'rel') ?? ''}\0${own(props, 'href') ?? ''}`, props);
    }
  }
  const tags: HeadTag[] = [];
  if (title !== undefined) tags.push({ tag: 'title', props: {}, text: title });
  for (const meta of metas) tags.push({ tag: 'meta', props: meta.props });
  for (const link of links) tags.push({ tag: 'link', props: link.props });
  return tags;
}

/** Writes `tags` into `document.head`, replacing the tags this head wrote before. */
function apply(tags: readonly HeadTag[]): void {
  const parent = document.head;
  for (const node of parent.querySelectorAll(`[${MARK}]`)) node.remove();
  for (const tag of tags) {
    const el = document.createElement(tag.tag);
    el.setAttribute(MARK, '');
    for (const [key, value] of Object.entries(tag.props)) el.setAttribute(key, value);
    if (tag.text !== undefined) el.textContent = tag.text;
    parent.append(el);
  }
}

/**
 * A head manager. `app.use(createHead())` provides it to `useHead()`. `tags()` is the record list
 * a server render can collect; in the browser the same list is written into `document.head`.
 */
export function createHead(): Head & Plugin {
  const reads: (() => HeadInput)[] = [];
  const head: Head & Plugin = {
    tags: () => resolve(reads.map((read) => read())),
    use(input) {
      const read = () => toValue(input);
      reads.push(read);
      const stop = watchSyncEffect(() => {
        read();
        apply(head.tags());
      });
      let alive = true;
      const remove = (): void => {
        if (!alive) return;
        alive = false;
        reads.splice(reads.indexOf(read), 1);
        stop();
        apply(head.tags());
      };
      // Registered twice so a second stop is a no-op after the first removal.
      onScopeDispose(remove);
      onScopeDispose(remove);
    },
    install(app: App) {
      app.provide(HEAD, head);
    },
  };
  active = head;
  return head;
}

/**
 * Contributes `input` to the head provided by `createHead()`, or to the one created most recently.
 * A ref or getter is read again when it changes. The contribution ends when the calling scope stops.
 */
export function useHead(input: MaybeRefOrGetter<HeadInput>): void {
  const provided = hasInjectionContext() ? inject(HEAD, undefined) : undefined;
  const head = provided ?? active ?? createHead();
  head.use(input);
}
