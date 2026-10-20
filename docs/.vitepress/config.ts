import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitepress';
import { EXCLUDE, loadSource, sidebar, SITE, stripCut } from '../scripts/docs.ts';

const DOCS = fileURLToPath(new URL('..', import.meta.url));

// The site serves the generated error pages; dead links fail the build. The sidebar lists the
// source pages and the CLI reference, which the build generates into cli/ first.
export default defineConfig({
  base: new URL(SITE).pathname,
  title: 'vibe.js',
  cleanUrls: true,
  srcExclude: EXCLUDE.filter((glob) => glob !== 'errors/**'),
  markdown: {
    languageAlias: { vibe: 'vue' },
    codeTransformers: [{ preprocess: stripCut }],
  },
  themeConfig: {
    search: { provider: 'local' },
    nav: [{ text: 'Errors', link: '/errors/' }],
    sidebar: sidebar(loadSource(DOCS)),
  },
});
