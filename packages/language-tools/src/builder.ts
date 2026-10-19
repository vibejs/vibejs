export const SpanKind = { Verbatim: 0, Atom: 1, Alias: 2 } as const;
export type SpanKind = (typeof SpanKind)[keyof typeof SpanKind];

/** Bit values identical to the TypeScript 7.1 SpanMapFeature. */
export const Feature = {
  None: 0,
  Hover: 1,
  SignatureHelp: 2,
  Completion: 4,
  Definition: 8,
  TypeDefinition: 16,
  Implementation: 32,
  References: 64,
  DocumentHighlights: 128,
  Rename: 256,
  CallHierarchy: 512,
  CodeActions: 1024,
  Formatting: 2048,
  InlayHints: 4096,
  SemanticTokens: 8192,
  FoldingRanges: 16384,
  SelectionRanges: 32768,
  LinkedEditing: 65536,
  AutoInsert: 131072,
  DocumentSymbols: 262144,
  CodeLens: 524288,
  All: 1048575,
} as const;

/** The span presets. Formatting is off everywhere. */
export const Preset: Readonly<Record<'EXPR' | 'BOUND' | 'ALIAS' | 'LINK' | 'ANCHOR', number>> = {
  /** The script and the template expressions. */
  EXPR: Feature.All & ~Feature.Formatting,
  /** Template names bound to setup bindings or props, tags and attribute keys: no rename. */
  BOUND: Feature.All & ~(Feature.Formatting | Feature.Rename | Feature.LinkedEditing),
  /** `@x` -> `onX`. */
  ALIAS:
    Feature.Hover |
    Feature.Definition |
    Feature.TypeDefinition |
    Feature.References |
    Feature.DocumentHighlights |
    Feature.SemanticTokens,
  /** Shadow names -> their declaration in the script. */
  LINK: Feature.Definition | Feature.References | Feature.DocumentHighlights,
  /** The default export -> the start of the file. */
  ANCHOR: Feature.Definition,
};

/** UTF-16 offsets; the protocol's tuple layout. */
export type SpanMapping = [
  vStart: number,
  vLength: number,
  oStart: number,
  oLength: number,
  kind: SpanKind,
  features: number,
];

/** Append-only virtual text with its spans into the original text. */
export class CodeBuilder {
  text = '';
  readonly spans: SpanMapping[] = [];
  readonly #original: string;

  constructor(original: string) {
    this.#original = original;
  }

  /** Synthesized text without a span. */
  add(s: string): this {
    this.text += s;
    return this;
  }

  /** The original text [oStart, oEnd), copied; an empty range adds nothing. */
  verbatim(oStart: number, oEnd: number, features: number): this {
    if (oStart === oEnd) return this;
    return this.#span(
      this.#original.slice(oStart, oEnd),
      oStart,
      oEnd,
      SpanKind.Verbatim,
      features,
    );
  }

  /** Synthesized text that stands for the original [oStart, oEnd). */
  atom(s: string, oStart: number, oEnd: number, features: number): this {
    return this.#span(s, oStart, oEnd, SpanKind.Atom, features);
  }

  /** A renamed original name, such as `onClick` for `click`. */
  alias(s: string, oStart: number, oEnd: number, features: number): this {
    return this.#span(s, oStart, oEnd, SpanKind.Alias, features);
  }

  /** Appends another builder over the same original text. */
  append(other: CodeBuilder): this {
    const shift = this.text.length;
    for (const [v, ...rest] of other.spans) this.spans.push([v + shift, ...rest]);
    this.text += other.text;
    return this;
  }

  #span(s: string, oStart: number, oEnd: number, kind: SpanKind, features: number): this {
    this.spans.push([this.text.length, s.length, oStart, oEnd - oStart, kind, features]);
    this.text += s;
    return this;
  }
}
