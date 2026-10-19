import type { SFCDescriptor, ScriptAnalysis } from '@vibejs-org/compiler';
import { Preset, type CodeBuilder } from './builder.ts';

/**
 * The user script, verbatim from virtual offset 0, with the type arguments of `defineProps` and
 * `defineEmits` moved (not duplicated) into `type __VibeProps` and `type __VibeEmits`, the
 * `defineExpose` call captured in `__vibe_exposed`, and `<__VibeRefs['k']>` inserted into each
 * `useTemplateRef('k')` without a type argument. Returns whether `__vibe_exposed` is declared.
 */
export function script(b: CodeBuilder, d: SFCDescriptor, analysis: ScriptAnalysis): boolean {
  const { props, emits, expose } = analysis.macros;
  const moved = [
    { name: '__VibeProps', range: props?.typeArg },
    { name: '__VibeEmits', range: emits?.typeArg },
  ];
  // ponytail: an assigned `const x = defineExpose(…)` is not captured; its exposed type is `{}`.
  const exposeAt =
    expose && !d.source.slice(0, expose.callStart).trimEnd().endsWith('=')
      ? expose.callStart
      : undefined;
  const block = d.scriptSetup;
  if (block) {
    /** Replacements of [start, end), in source order. */
    const edits: [number, number, () => void][] = [];
    for (const { name, range } of moved) if (range) edits.push([...range, () => b.add(name)]);
    if (exposeAt !== undefined) {
      edits.push([exposeAt, exposeAt, () => b.add('const __vibe_exposed = ')]);
    }
    for (const { key, keyLoc, typeArgInsertAt: at } of analysis.templateRefs) {
      if (at === null) continue;
      // A wrong key fails at the string literal.
      const typeArg = `<__VibeRefs[${JSON.stringify(key)}]>`;
      edits.push([at, at, () => b.atom(typeArg, ...keyLoc, Preset.NONE)]);
    }
    let at = block.loc.start.offset;
    for (const [start, end, edit] of edits.toSorted((x, y) => x[0] - y[0])) {
      b.verbatim(at, start, Preset.EXPR);
      edit();
      at = end;
    }
    b.verbatim(at, block.loc.end.offset, Preset.EXPR).add('\n');
  }
  for (const { name, range } of moved) {
    b.add(`type ${name} = `);
    if (range) b.verbatim(...range, Preset.EXPR);
    else b.add('{}');
    b.add(';\n');
  }
  return exposeAt !== undefined;
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
