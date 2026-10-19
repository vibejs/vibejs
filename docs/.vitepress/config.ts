import { defineConfig } from 'vitepress';
import { EXCLUDE, SITE, stripCut } from '../scripts/docs.ts';

// The site serves the generated error pages; dead links fail the build.
export default defineConfig({
  base: new URL(SITE).pathname,
  title: 'vibe.js',
  cleanUrls: true,
  srcExclude: EXCLUDE.filter((glob) => glob !== 'errors/**'),
  markdown: {
    languageAlias: { vibe: 'vue' },
    codeTransformers: [{ preprocess: stripCut }],
  },
  themeConfig: { search: { provider: 'local' } },
});
