// oxlint-disable typescript/no-explicit-any, typescript/no-generated-empty-object-type -- C4 component signatures
// Wrappers over rendered nodes for component tests: CSS queries, output and user input.
import type { Component, ComponentEmits, ComponentProps } from '../component.ts';
import { vibeError } from '../errors.gen.ts';
import { nextTick } from '../runtime/scheduler.ts';

/** Rendered DOM in a test: an element, or nothing when `find()` matched nothing. */
export interface DOMWrapper<E extends Element = Element> {
  readonly element: E;
  /** `false` for the wrapper that `find()` returns when nothing matches. */
  exists(): boolean;
  /** The first element that matches a CSS selector, or an empty wrapper. */
  find<K extends keyof HTMLElementTagNameMap>(selector: K): DOMWrapper<HTMLElementTagNameMap[K]>;
  find<T extends Element = Element>(selector: string): DOMWrapper<T>;
  /** Every element that matches a CSS selector, in document order. */
  findAll<K extends keyof HTMLElementTagNameMap>(
    selector: K,
  ): DOMWrapper<HTMLElementTagNameMap[K]>[];
  findAll<T extends Element = Element>(selector: string): DOMWrapper<T>[];
  /** The first element that matches a CSS selector; VIBE7201 with the rendered HTML when none does. */
  get<K extends keyof HTMLElementTagNameMap>(selector: K): DOMWrapper<HTMLElementTagNameMap[K]>;
  get<T extends Element = Element>(selector: string): DOMWrapper<T>;
  /** The trimmed text content. */
  text(): string;
  /** The markup without the runtime's comment anchors, one root node per line. */
  html(): string;
  attributes(): Record<string, string>;
  attributes(name: string): string | undefined;
  classes(): string[];
  classes(name: string): boolean;
  /** `false` when detached, or when the element or an ancestor is `hidden`, `display: none` or `visibility: hidden`. */
  isVisible(): boolean;
  /**
   * Dispatches a bubbling, cancelable native event with `init` (a `MouseEvent`, `KeyboardEvent`,
   * `FocusEvent` or `InputEvent` by its name), unless the element is disabled, then awaits the
   * DOM update. Keys go in `init`: `trigger('keydown', { key: 'Enter' })`.
   */
  trigger(event: string, init?: Record<string, unknown>): Promise<void>;
  /**
   * Sets the value of an input, a textarea or a select (an array for `multiple`), or the checked
   * state of a checkbox or a radio, dispatches the events of user input, then awaits the DOM update.
   */
  setValue(value: string | number | boolean | readonly string[]): Promise<void>;
}

/** A mounted component: its root nodes, its props and the events it emitted. */
export interface ComponentWrapper<C extends Component<any>> extends Omit<DOMWrapper, 'setValue'> {
  /** Assigns props, then awaits the DOM update. */
  setProps(props: Partial<ComponentProps<C>>): Promise<void>;
  /** The arguments of each emitted event, by event name. */
  emitted(): Partial<Record<keyof ComponentEmits<C> & string, unknown[][]>>;
  emitted<K extends keyof ComponentEmits<C> & string>(event: K): ComponentEmits<C>[K][] | undefined;
  /** Unmounts the component and removes its nodes; a second call does nothing. */
  unmount(): void;
}

/** The event class of a native event name. */
function eventClass(name: string): new (type: string, init: EventInit) => Event {
  if (/^(?:click|dblclick|contextmenu|mouse)/.test(name)) return MouseEvent;
  if (name.startsWith('key')) return KeyboardEvent;
  if (/^(?:focus|blur)/.test(name)) return FocusEvent;
  if (/^(?:before)?input$/.test(name)) return InputEvent;
  return Event;
}

const fire = (el: Element, type: string): void => {
  el.dispatchEvent(new Event(type, { bubbles: true }));
};

/** The markup of a node without comments; empty for a comment. */
function serialize(node: Node): string {
  if (node instanceof Text) return node.data;
  if (!(node instanceof Element)) return '';
  const copy = node.cloneNode(true);
  const comments = document.createNodeIterator(copy, NodeFilter.SHOW_COMMENT);
  for (let comment = comments.nextNode(); comment; comment = comments.nextNode()) {
    comment.parentNode!.removeChild(comment);
  }
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the clone of an element
  return (copy as Element).outerHTML;
}

/** The markup of `nodes`, one non-empty node per line. */
export const serializeAll = (nodes: Iterable<Node>): string =>
  [...nodes].map(serialize).filter(Boolean).join('\n');

/**
 * The implementation of every wrapper: `roots` gives the nodes it reads, or is the selector that
 * matched nothing for the empty wrapper of `find()`; `alive` throws once the component unmounted.
 */
export class Wrapper {
  readonly #roots: (() => readonly Node[]) | string;
  readonly #alive: () => void;

  constructor(roots: (() => readonly Node[]) | string, alive: () => void) {
    this.#roots = roots;
    this.#alive = alive;
  }

  #use(method: string): readonly Node[] {
    this.#alive();
    if (typeof this.#roots === 'string') {
      throw vibeError('VIBE7202', { selector: this.#roots, method });
    }
    return this.#roots();
  }

  #element(method: string): Element {
    const elements = this.#use(method).filter((node) => node instanceof Element);
    if (elements.length !== 1) throw vibeError('VIBE7207', { count: elements.length });
    return elements[0];
  }

  #query(selector: string, method: string): Wrapper[] {
    const found: Element[] = [];
    for (const node of this.#use(method)) {
      if (!(node instanceof Element)) continue;
      if (node.matches(selector)) found.push(node);
      found.push(...node.querySelectorAll(selector));
    }
    return found.map((el) => new Wrapper(() => [el], this.#alive));
  }

  get element(): Element {
    return this.#element('element');
  }

  exists(): boolean {
    this.#alive();
    return typeof this.#roots !== 'string';
  }

  find(selector: string): Wrapper {
    return this.#query(selector, 'find').at(0) ?? new Wrapper(selector, this.#alive);
  }

  findAll(selector: string): Wrapper[] {
    return this.#query(selector, 'findAll');
  }

  get(selector: string): Wrapper {
    const first = this.#query(selector, 'get').at(0);
    if (!first) throw vibeError('VIBE7201', { selector, html: this.html() });
    return first;
  }

  text(): string {
    return this.#use('text')
      .map((node) => node.textContent)
      .join('')
      .trim();
  }

  html(): string {
    return serializeAll(this.#use('html'));
  }

  attributes(): Record<string, string>;
  attributes(name: string): string | undefined;
  attributes(name?: string): Record<string, string> | string | undefined {
    const el = this.#element('attributes');
    if (name !== undefined) return el.getAttribute(name) ?? undefined;
    return Object.fromEntries([...el.attributes].map((attr) => [attr.name, attr.value]));
  }

  classes(): string[];
  classes(name: string): boolean;
  classes(name?: string): string[] | boolean {
    const list = this.#element('classes').classList;
    return name === undefined ? [...list] : list.contains(name);
  }

  isVisible(): boolean {
    const el = this.#element('isVisible');
    if (!el.isConnected) return false;
    for (let cur: Element | null = el; cur; cur = cur.parentElement) {
      const style = getComputedStyle(cur);
      if (cur.hasAttribute('hidden') || style.display === 'none' || style.visibility === 'hidden') {
        return false;
      }
    }
    return true;
  }

  async trigger(event: string, init: Record<string, unknown> = {}): Promise<void> {
    const el = this.#element('trigger');
    if (event.includes('.')) {
      throw vibeError('VIBE7203', { event, example: "trigger('keydown', { key: 'Enter' })" });
    }
    if (!el.matches(':disabled')) {
      const EventClass = eventClass(event);
      el.dispatchEvent(new EventClass(event, { bubbles: true, cancelable: true, ...init }));
    }
    await nextTick();
  }

  async setValue(value: string | number | boolean | readonly string[]): Promise<void> {
    const el = this.#element('setValue');
    if (el instanceof HTMLInputElement && (el.type === 'checkbox' || el.type === 'radio')) {
      el.checked = Boolean(value);
      fire(el, 'change');
    } else if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
      el.value = String(value);
      fire(el, 'input');
      fire(el, 'change');
    } else if (el instanceof HTMLSelectElement) {
      const values = typeof value === 'object' ? value : [String(value)];
      for (const option of el.options) option.selected = values.includes(option.value);
      fire(el, 'change');
    } else {
      throw vibeError('VIBE7204', { tag: el.tagName.toLowerCase() });
    }
    await nextTick();
  }
}
