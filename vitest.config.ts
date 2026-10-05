import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'url';

export default defineConfig({
  resolve: {
    alias: {
      'astro:middleware': fileURLToPath(new URL('./src/test/stubs/astro-middleware.ts', import.meta.url)),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    env: { MOCK_API: 'false' },
  },
});
