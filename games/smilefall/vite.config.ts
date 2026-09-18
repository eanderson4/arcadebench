import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/smilefall/' : '/',
  envDir: resolve(import.meta.dirname, '../..'),
  server: {
    host: '127.0.0.1',
    port: 5186,
    strictPort: true,
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: resolve(import.meta.dirname, 'src/viewer/index.html'),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
}));
