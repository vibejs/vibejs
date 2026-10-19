import { defineConfig } from 'tsdown';
import { base } from '../../tsdown.base.ts';

// src/server.ts is the content-mapper process (package.json `typescript.contentMapper.exec`), not an export.
export default defineConfig({ ...base, entry: ['src/index.ts', 'src/server.ts'] });
