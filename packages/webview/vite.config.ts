import { svelte } from '@sveltejs/vite-plugin-svelte';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

// The webview is a single static bundle loaded by the extension host
// (see packages/extension/src/panel.ts). Fixed filenames, no index.html.
export default defineConfig(({ mode }) => ({
  plugins: [tailwindcss(), svelte()],
  resolve: {
    alias: { $lib: fileURLToPath(new URL('./src/lib', import.meta.url)) }
  },
  build: {
    outDir: '../extension/dist/webview',
    emptyOutDir: true,
    sourcemap: mode === 'development' ? 'inline' : false,
    cssCodeSplit: false,
    rollupOptions: {
      input: 'src/main.ts',
      output: {
        entryFileNames: 'index.js',
        assetFileNames: (a) => (a.names?.[0]?.endsWith('.css') ? 'index.css' : '[name][extname]')
      }
    }
  },
  test: { include: ['src/**/*.test.ts'] }
}));
