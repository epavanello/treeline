import { defineConfig } from '@vscode/test-cli';

// e2e/*.test.ts, bundled by `pnpm e2e` (vscode stays external, so the tests share the extension's API object)
export default defineConfig({
  files: '.cache/e2e/*.test.cjs',
  mocha: { ui: 'bdd', timeout: 60_000 }
});
