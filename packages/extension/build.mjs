import { context } from 'esbuild';

const ctx = await context({
  entryPoints: ['src/extension.ts'],
  outfile: 'dist/extension.cjs',
  bundle: true,
  format: 'cjs',
  platform: 'node',
  target: 'node20',
  external: ['vscode'],
  // jsonc-parser's default (UMD) build requires its own files at runtime: take its ESM one
  mainFields: ['module', 'main'],
  sourcemap: process.argv.includes('--watch') ? 'inline' : false,
  minify: !process.argv.includes('--watch'),
  logLevel: 'info'
});

if (process.argv.includes('--watch')) await ctx.watch();
else (await ctx.rebuild(), await ctx.dispose());
