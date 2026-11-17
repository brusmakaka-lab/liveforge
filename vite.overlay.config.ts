import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';
export default defineConfig({
  root: resolve('src/browser'),
  plugins: [react()],
  build: { outDir: resolve('out/overlay'), emptyOutDir: true },
});
