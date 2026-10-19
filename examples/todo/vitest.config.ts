import { compile, formatDiagnostic } from '@vibejs-org/compiler';
import { transformWithOxc } from 'vite';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [
    {
      // Compiles .vibe files for the test run; replaced by vibe() from @vibejs-org/compiler/vite.
      name: 'todo:vibe',
      async transform(code, id) {
        if (!id.endsWith('.vibe')) return null;
        // ponytail: one fixed id, as TodoList.vibe has no scoped style.
        const r = compile(code, { filename: id, id: '00000000', dev: false });
        if (r.diagnostics.length) {
          this.error(r.diagnostics.map((d) => formatDiagnostic(d, code)).join('\n'));
        }
        return transformWithOxc(r.code, `${id}.ts`, { lang: 'ts' });
      },
    },
  ],
  test: { environment: 'node' },
});
