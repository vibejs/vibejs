import { analyzeScript, parse } from '@vibejs-org/compiler';
import { expect, it } from 'vitest';
import { CodeBuilder, Preset, SpanKind } from './builder.ts';
import { script, setupBindings } from './script.ts';

function run(source: string) {
  const { descriptor } = parse(source, { filename: 'A.vibe' });
  const analysis = analyzeScript(descriptor);
  const b = new CodeBuilder(source);
  script(b, descriptor, analysis);
  return { text: b.text, analysis };
}

it('moves the type arguments of defineEmits and defineProps, in source order', () => {
  const { text } = run(`<script setup lang="ts">
const emit = defineEmits<{ go: [] }>()
const props = defineProps<{ a: string }>()
</script>`);
  expect(text).toBe(`
const emit = defineEmits<__VibeEmits>()
const props = defineProps<__VibeProps>()

type __VibeProps = { a: string };
type __VibeEmits = { go: [] };
`);
});

it('moves the type argument of defineSlots', () => {
  const { text } = run(`<script setup lang="ts">
defineSlots<{ a?: () => unknown }>()
</script>`);
  expect(text).toBe(`
defineSlots<__VibeSlots>()

type __VibeProps = {};
type __VibeEmits = {};
type __VibeSlots = { a?: () => unknown };
`);
});

it('declares empty types without macros or without a script', () => {
  const empty = 'type __VibeProps = {};\ntype __VibeEmits = {};\n';
  expect(run('<script setup lang="ts">\nconst a = 1\n</script>').text).toBe(
    `\nconst a = 1\n\n${empty}`,
  );
  expect(run('<template><p /></template>').text).toBe(empty);
});

it('shadows script bindings and destructured props, not props declared only by the type', () => {
  const { analysis } = run(`<script setup lang="ts">
import { ref } from '@vibejs-org/ui'
const { a, b: c } = defineProps<{ a: string; b: string; d: string }>()
let e = ref(0)
</script>`);
  expect([...setupBindings(analysis).keys()]).toEqual(['ref', 'a', 'c', 'e']);
});

it('captures defineExpose and types useTemplateRef by its key, in source order', () => {
  const source = `<script setup lang="ts">
const a = useTemplateRef('a')
defineExpose({ a })
const b = useTemplateRef<HTMLElement>('b')
</script>`;
  const { descriptor } = parse(source, { filename: 'A.vibe' });
  const b = new CodeBuilder(source);
  expect(script(b, descriptor, analyzeScript(descriptor))).toBe(true);
  expect(b.text).toContain(`const a = useTemplateRef<__VibeRefs["a"]>('a')
const __vibe_exposed = defineExpose({ a })
const b = useTemplateRef<HTMLElement>('b')`);
  // The inserted type argument stands for the key.
  const at = source.indexOf("'a'");
  expect(b.spans).toContainEqual([25, 17, at, 3, SpanKind.Atom, Preset.NONE]);
});

it('does not capture an assigned defineExpose', () => {
  const source = '<script setup lang="ts">\nconst x = defineExpose({})\n</script>';
  const { descriptor } = parse(source, { filename: 'A.vibe' });
  expect(script(new CodeBuilder(source), descriptor, analyzeScript(descriptor))).toBe(false);
});
