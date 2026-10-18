import type { UserConfig } from 'tsdown';

export const base: UserConfig = {
  format: 'esm',
  target: 'es2022',
  dts: true,
  fixedExtension: false,
  sourcemap: false,
  exports: { devExports: 'vibejs-source', packageJson: false },
  publint: { level: 'error' },
  attw: { profile: 'esm-only', level: 'error' },
  failOnWarn: 'ci-only',
};
