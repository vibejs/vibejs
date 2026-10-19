import type { VibeError } from '@vibejs-org/errors';
import postcss, { CssSyntaxError } from 'postcss';
import { LineIndex, toDiagnostic, type Diagnostic } from '../diagnostics.ts';
import { vibeError } from '../errors.gen.ts';
import { pluginScoped } from './pluginScoped.ts';

export interface SourceMapV3 {
  version: 3;
  file?: string;
  sources: string[];
  sourcesContent?: (string | null)[];
  names: string[];
  mappings: string;
}

/**
 * Scopes the plain CSS of one `<style scoped>` block to its component. `id` is the component's
 * 8-hex id, the same one passed to `compile()`. Positions in diagnostics are relative to `css`;
 * `file` is `filename`. Never throws on user input: any diagnostic gives `code: ''`, `map: null`.
 */
export function compileStyle(
  css: string,
  options: { filename: string; id: string },
): { code: string; map: SourceMapV3 | null; diagnostics: Diagnostic[] } {
  const { filename, id } = options;
  const index = new LineIndex(css);
  const diagnostics: Diagnostic[] = [];
  const report = (error: VibeError, start: number, end: number) => {
    diagnostics.push(toDiagnostic(error, filename, index.position(start), index.position(end)));
  };
  try {
    const plugin = pluginScoped(id, (escape, start, end) => {
      report(vibeError('VIBE4005', { escape }), start, end);
    });
    // `to` makes `sources` relative to the file's own directory instead of the working
    // directory, and `prev: false` reads no source map from a comment or from disk.
    const result = postcss([plugin]).process(css, {
      from: filename,
      to: filename,
      map: { inline: false, annotation: false, sourcesContent: true, prev: false },
    });
    const code = result.css;
    if (!diagnostics.length) {
      const { file, sources, sourcesContent, names, mappings } = result.map.toJSON();
      const map: SourceMapV3 = { version: 3, file, sources, sourcesContent, names, mappings };
      return { code, map, diagnostics };
    }
  } catch (error) {
    if (!(error instanceof CssSyntaxError)) throw error;
    const { offset, endOffset = offset } = error.input!;
    // The selector parser ends its reasons with a period; the catalog message adds one.
    report(vibeError('VIBE4001', { reason: error.reason.replace(/\.$/, '') }), offset, endOffset);
  }
  return { code: '', map: null, diagnostics };
}
