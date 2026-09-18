import { resolve } from 'node:path';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';

const shared = { '@shared': resolve('src/shared') };

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: { alias: shared },
    // The shim builds beside the app and imports nothing from it, so plain Node runs it.
    build: { rollupOptions: { input: { index: resolve('src/main/index.ts'), 'hatch-mcp': resolve('src/shim/mcp-stdio.ts') } } },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: { alias: shared },
    build: {
      rollupOptions: {
        input: { host: resolve('src/preload/host.ts'), guest: resolve('src/guest-preload/index.ts') },
        // Sandboxed preloads load as CommonJS only.
        output: { format: 'cjs', entryFileNames: '[name].cjs' },
      },
    },
  },
  renderer: {
    root: resolve('src/renderer'),
    plugins: [react()],
    resolve: { alias: shared },
    build: { rollupOptions: { input: { index: resolve('src/renderer/index.html') } } },
  },
});
