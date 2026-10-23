// @vitest-environment jsdom
// Every static template the codegen emits must survive the HTML parser unchanged, or the node
// paths into its clone point at the wrong nodes.
import { globSync, readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

// Relative to the repo root: under jsdom, `import.meta.url` is not a file URL.
const root = 'packages/compiler/test/fixtures/';
const files = globSync('**/output*.ts', { cwd: root });
// The codegen emits `_template(<JSON string>[, "svg" | "math"])`.
const call = /_template\(("(?:[^"\\]|\\.)*")(?:, "(svg|math)")?\)/g;

/** `html` in the serializer's spelling: the codegen's short `<!>` and bare `attr` are equivalent. */
const serialized = (html: string): string =>
  html
    .replaceAll('<!>', '<!---->')
    .replaceAll(/<[a-z][^\s/>]*(?:\s+[^\s=>]+(?:="[^"]*")?)*>/gi, (tag) =>
      tag.replaceAll(/(\s[^\s=>]+)(="[^"]*")?/g, (_, name: string, value = '=""') => name + value),
    );

it('finds templates in the fixtures', () => {
  expect(files.length).toBeGreaterThan(0);
});

it.each(files)('%s: each template re-serializes identically with one root', (file) => {
  const templates = [...readFileSync(root + file, 'utf8').matchAll(call)];
  for (const [i, [, json, ns]] of templates.entries()) {
    const html: string = JSON.parse(json);
    // Parsed as template() in @usevibejs/ui does.
    const t = document.createElement('template');
    t.innerHTML = ns ? `<${ns}>${html}</${ns}>` : html;
    const wrapper = ns ? t.content.firstElementChild! : t;
    const at = `${file} template ${i}`;
    const roots = (ns ? wrapper : t.content).childNodes.length;
    expect({ at, roots, html: wrapper.innerHTML }).toEqual({
      at,
      roots: 1,
      html: serialized(html),
    });
  }
});
