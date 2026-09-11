import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig(({ command }) => ({
  // Development keeps Vite's source entry reachable for the visual harness.
  // Production is a permanent, self-contained route in the assembled arcade.
  base: command === 'build' ? '/maltline/' : '/',
  envDir: resolve(import.meta.dirname, '../..'),
  server: {
    host: '127.0.0.1',
    port: 5184,
    strictPort: true,
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    // Release assets must remain inspectable files covered by the shipped
    // allowlist; never hide a small font/media import inside JS or CSS.
    assetsInlineLimit: 0,
    rollupOptions: {
      input: resolve(import.meta.dirname, 'src/viewer/index.html'),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
}));
