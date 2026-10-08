import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: true,
    rollupOptions: {
      input: {
        app: resolve(projectRoot, 'index.html'),
        notFound: resolve(projectRoot, '404.html')
      }
    }
  },
  test: {
    exclude: ['tests/browser/**', 'node_modules/**', 'dist/**'],
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: true
  }
});
