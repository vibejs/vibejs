import { vibe } from '@vibejs-org/compiler/vite';
import { defineConfig } from 'vite';

// `vibejs dev` serves the API under /api on the same port, so no proxy is needed.
export default defineConfig({
  plugins: [vibe()],
});
