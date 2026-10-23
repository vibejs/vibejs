import { defineConfig } from 'tsdown';

// Not `base`: the extension is private (no publint or attw) and VS Code loads it as CommonJS.
// `vscode` is provided by the editor; @usevibejs/errors is bundled, so the VSIX has no
// dependencies.
export default defineConfig({
  entry: 'src/extension.ts',
  format: 'cjs',
  platform: 'node',
  target: 'es2022',
  dts: false,
  sourcemap: false,
  deps: { neverBundle: ['vscode'], alwaysBundle: ['@usevibejs/errors'] },
  failOnWarn: 'ci-only',
});
