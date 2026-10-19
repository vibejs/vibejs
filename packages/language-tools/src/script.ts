import type { SFCDescriptor, ScriptAnalysis } from '@vibejs-org/compiler';
import { Preset, type CodeBuilder } from './builder.ts';

/**
 * The user script, verbatim from virtual offset 0, with the type arguments of `defineProps` and
 * `defineEmits` moved (not duplicated) into `type __VibeProps` and `type __VibeEmits`.
 */
export function script(b: CodeBuilder, d: SFCDescriptor, analysis: ScriptAnalysis): void {
  const { props, emits } = analysis.macros;
  const moved = [
    { name: '__VibeProps', range: props?.typeArg },
    { name: '__VibeEmits', range: emits?.typeArg },
  ];
  const block = d.scriptSetup;
  if (block) {
    let at = block.loc.start.offset;
    const ranges = moved.filter((m) => m.range).toSorted((x, y) => x.range![0] - y.range![0]);
    for (const { name, range } of ranges) {
      b.verbatim(at, range![0], Preset.EXPR).add(name);
      at = range![1];
    }
    b.verbatim(at, block.loc.end.offset, Preset.EXPR).add('\n');
  }
  for (const { name, range } of moved) {
    b.add(`type ${name} = `);
    if (range) b.verbatim(...range, Preset.EXPR);
    else b.add('{}');
    b.add(';\n');
  }
}

/** Setup bindings the template block shadows: props declared only by the type are not among them. */
export function setupBindings(analysis: ScriptAnalysis): Map<string, [number, number]> {
  const typeOnly = new Set(analysis.propKeys.map((k) => k.decl[0]));
  const setup = new Map<string, [number, number]>();
  for (const [name, { kind, decl }] of analysis.bindings) {
    if (kind !== 'prop' || !typeOnly.has(decl[0])) setup.set(name, decl);
  }
  return setup;
}
