import type { VibeError } from '@vibejs-org/errors';
import { LineIndex, toDiagnostic, type Diagnostic, type Position } from '../diagnostics.ts';
import { vibeError } from '../errors.gen.ts';
import {
  NodeTypes,
  type AttributeNode,
  type ElementNode,
  type RootNode,
  type SourceLocation,
} from '../template/ast.ts';
import { baseParse } from '../template/parser.ts';

export type StyleLang = 'css' | 'scss' | 'sass' | 'less' | 'styl' | 'stylus' | 'postcss';

/** A top-level block. `loc` covers its content, between the start and the end tag. */
export interface SFCBlock {
  content: string;
  loc: SourceLocation;
  attrs: Record<string, string | true>;
}

export interface SFCDescriptor {
  filename: string;
  source: string;
  /** `ast.children` are the template's children, with file-relative locations. */
  template: (SFCBlock & { ast: RootNode }) | null;
  scriptSetup: SFCBlock | null;
  styles: (SFCBlock & { scoped: boolean; lang: StyleLang })[];
}

const STYLE_LANGS: ReadonlySet<unknown> = new Set<StyleLang>([
  'css',
  'scss',
  'sass',
  'less',
  'styl',
  'stylus',
  'postcss',
]);
const isStyleLang = (value: string | true): value is StyleLang => STYLE_LANGS.has(value);
const BLOCK_ATTRS: Record<string, Set<string>> = {
  template: new Set(),
  script: new Set(['setup', 'lang']),
  style: new Set(['scoped', 'lang']),
};
const BLOCK_COMMENT = /\/\*[\s\S]*?(?:\*\/|$)/g;
const ANY_COMMENT = /\/\*[\s\S]*?(?:\*\/|$)|\/\/.*/g;
const LINE_COMMENT_LANGS = new Set(['scss', 'sass', 'less', 'styl', 'stylus']);
const STYLE_CHECKS: [RegExp, (selector: string) => VibeError][] = [
  [/::v-slotted|:slotted(?=\()/g, (selector) => vibeError('VIBE4002', { selector })],
  [/v-bind(?=\()/g, () => vibeError('VIBE4003')],
  [/>>>|\/deep\/|::v-deep|::v-global/g, (selector) => vibeError('VIBE4004', { selector })],
];

/**
 * Parses a `.vibe` file into its blocks and the template AST. Pure and synchronous; it never
 * throws, and reports every problem as a diagnostic, in source order.
 */
export function parse(
  source: string,
  options: { filename: string },
): { descriptor: SFCDescriptor; diagnostics: Diagnostic[] } {
  const { filename } = options;
  const diagnostics: Diagnostic[] = [];
  const lines = new LineIndex(source);
  const report = (error: VibeError, start: number, end: number) => {
    diagnostics.push(toDiagnostic(error, filename, lines.position(start), lines.position(end)));
  };
  const root = baseParse(source, (error, start: Position, end: Position) => {
    diagnostics.push(toDiagnostic(error, filename, start, end));
  });
  const descriptor: SFCDescriptor = {
    filename,
    source,
    template: null,
    scriptSetup: null,
    styles: [],
  };

  for (const node of root.children) {
    if (node.type === NodeTypes.COMMENT) continue;
    if (node.type !== NodeTypes.ELEMENT) {
      const text = node.loc.source;
      const start = node.loc.start.offset + text.length - text.trimStart().length;
      if (text.trim()) report(vibeError('VIBE1012'), start, start + text.trim().length);
      continue;
    }
    const { tag } = node;
    const startTag: [number, number] = [node.loc.start.offset, node.innerLoc!.start.offset];
    if (!(tag in BLOCK_ATTRS)) {
      report(vibeError('VIBE1011', { tag }), ...startTag);
      continue;
    }
    const block = createBlock(node, source);
    const attr = (name: string) =>
      node.props.find((p): p is AttributeNode => p.type === NodeTypes.ATTRIBUTE && p.name === name);
    for (const p of node.props) {
      const name = p.type === NodeTypes.ATTRIBUTE ? p.name : p.rawName!;
      const at: [number, number] = [p.loc.start.offset, p.loc.end.offset];
      if (name === 'src') report(vibeError('VIBE1006', { block: tag }), ...at);
      else if (tag === 'template' && name === 'lang')
        report(vibeError('VIBE1008', { attr: p.loc.source }), ...at);
      else if (tag === 'script' && name === 'generic') report(vibeError('VIBE1013'), ...at);
      else if (tag === 'style' && name === 'module') report(vibeError('VIBE1007'), ...at);
      else if (!BLOCK_ATTRS[tag].has(name))
        report(vibeError('VIBE1010', { block: tag, name }), ...at);
    }
    if (tag === 'template') {
      if (descriptor.template) report(vibeError('VIBE1002'), ...startTag);
      else {
        const ast: RootNode = {
          type: NodeTypes.ROOT,
          source,
          children: node.children,
          loc: block.loc,
        };
        descriptor.template = { ...block, ast };
      }
    } else if (tag === 'script') {
      if (descriptor.scriptSetup) report(vibeError('VIBE1003'), ...startTag);
      else descriptor.scriptSetup = block;
      if (!attr('setup')) report(vibeError('VIBE1004'), ...startTag);
      const lang = attr('lang');
      if (!lang) report(vibeError('VIBE1005', { lang: 'no `lang`' }), ...startTag);
      else if (block.attrs.lang !== 'ts') {
        const at: [number, number] = [lang.loc.start.offset, lang.loc.end.offset];
        report(vibeError('VIBE1005', { lang: `\`${lang.loc.source}\`` }), ...at);
      }
    } else {
      const lang = attr('lang');
      const value = lang ? block.attrs.lang : 'css';
      if (lang && !isStyleLang(value)) {
        report(
          vibeError('VIBE1009', { attr: lang.loc.source }),
          lang.loc.start.offset,
          lang.loc.end.offset,
        );
      }
      const styleLang = isStyleLang(value) ? value : 'css';
      checkStyle(block, styleLang, report);
      descriptor.styles.push({ ...block, scoped: 'scoped' in block.attrs, lang: styleLang });
    }
  }
  if (!descriptor.template) {
    const start = lines.position(0);
    diagnostics.unshift(toDiagnostic(vibeError('VIBE1001'), filename, start, start));
  }
  diagnostics.sort((a, b) => a.start.offset - b.start.offset);
  return { descriptor, diagnostics };
}

function createBlock(node: ElementNode, source: string): SFCBlock {
  const loc = node.innerLoc!;
  const attrs: Record<string, string | true> = {};
  for (const p of node.props) {
    if (p.type === NodeTypes.ATTRIBUTE) attrs[p.name] = p.value?.content || true;
  }
  return { content: source.slice(loc.start.offset, loc.end.offset), loc, attrs };
}

/** Reports unsupported selectors in the raw style text, with comments blanked out. */
function checkStyle(
  block: SFCBlock,
  lang: string,
  report: (error: VibeError, start: number, end: number) => void,
): void {
  const comments = LINE_COMMENT_LANGS.has(lang) ? ANY_COMMENT : BLOCK_COMMENT;
  // Known limit: comment markers inside strings and url() are blanked too.
  const text = block.content.replace(comments, (c) => ' '.repeat(c.length));
  const base = block.loc.start.offset;
  for (const [re, error] of STYLE_CHECKS) {
    for (const m of text.matchAll(re))
      report(error(m[0]), base + m.index, base + m.index + m[0].length);
  }
}
