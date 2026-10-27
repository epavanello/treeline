/**
 * The editor's own way of coloring code, for the diffs the webview shows: a color theme's token colors
 * and the TextMate grammars that extensions contribute, read from their JSON files. Shiki, in the
 * webview, takes both as they are. vscode-free: `theme.ts` passes the installed extensions, the
 * preview's fixture those bundled with VS Code.
 */
import { readFile } from 'node:fs/promises';
import * as path from 'node:path';
import { parse } from 'jsonc-parser';
import type { CodeTheme, Grammars } from '@treeline/shared';

/** An extension: its folder and its package.json's `contributes`. */
export interface Extension {
  dir: string;
  contributes: {
    themes?: { id?: string; label?: string; path: string }[];
    languages?: { id: string; extensions?: string[]; filenames?: string[] }[];
    grammars?: { language?: string; scopeName: string; path: string }[];
  };
}

type Json = Record<string, unknown>;
const files = new Map<string, Promise<Json | null>>();
/** A theme or grammar file (JSON with comments); null when unreadable or not JSON (a .tmTheme). */
function read(file: string) {
  if (!files.has(file))
    files.set(
      file,
      readFile(file, 'utf8').then(
        (text) => (file.endsWith('.json') ? (parse(text) as Json) : null),
        () => null
      )
    );
  return files.get(file)!;
}

/** A theme file with the files it `include`s (the base theme first). */
async function load(file: string): Promise<{ colors: Json; tokenColors: unknown[] }> {
  const t = await read(file);
  if (!t) return { colors: {}, tokenColors: [] };
  const base =
    typeof t.include === 'string'
      ? await load(path.join(path.dirname(file), t.include))
      : { colors: {}, tokenColors: [] };
  return {
    colors: { ...base.colors, ...(t.colors as Json) },
    // A path instead of a list points to a .tmTheme: not supported
    tokenColors: [...base.tokenColors, ...(Array.isArray(t.tokenColors) ? t.tokenColors : [])]
  };
}

/** Theme `id` (its id, else its label) among `extensions`, with extra `rules`; null if not found. */
export async function themeOf(
  extensions: Extension[],
  id: string,
  type: CodeTheme['type'],
  rules: unknown[]
): Promise<CodeTheme | null> {
  for (const { dir, contributes } of extensions)
    for (const t of contributes.themes ?? []) {
      // The setting may say "Default Dark Modern" for the built-in theme whose id is "Dark Modern"
      const name = t.id ?? t.label;
      if (name !== id && `Default ${name}` !== id) continue;
      const { colors, tokenColors } = await load(path.join(dir, t.path));
      return {
        name: id,
        type,
        colors: colors as Record<string, string>,
        tokenColors: [...tokenColors, ...rules]
      };
    }
  return null;
}

/**
 * The grammar for a file (by its name, then its longest matching extension), with every grammar it
 * includes or embeds, in no particular order; null when no installed extension knows the language.
 */
export async function grammarsOf(extensions: Extension[], file: string): Promise<Grammars | null> {
  const name = path.basename(file).toLowerCase();
  let lang: string | undefined;
  let best = 0;
  for (const { contributes } of extensions)
    for (const l of contributes.languages ?? []) {
      if (l.filenames?.some((f) => f.toLowerCase() === name)) {
        lang = l.id;
        best = Infinity;
      }
      for (const ext of l.extensions ?? [])
        if (name.endsWith(ext.toLowerCase()) && ext.length > best) {
          lang = l.id;
          best = ext.length;
        }
    }
  const byScope = new Map<string, string>();
  let root: string | undefined;
  for (const { dir, contributes } of extensions)
    for (const g of contributes.grammars ?? []) {
      byScope.set(g.scopeName, path.join(dir, g.path));
      if (lang && g.language === lang) root ??= g.scopeName;
    }
  if (!root) return null;
  const grammars: Json[] = [];
  const seen = new Set<string>();
  const visit = async (scope: string) => {
    if (seen.has(scope) || !byScope.has(scope)) return;
    seen.add(scope);
    const g = await read(byScope.get(scope)!);
    if (!g) return;
    grammars.push({ ...g, scopeName: scope });
    // Other grammars it includes (`source.css#rule`) or embeds
    const text = JSON.stringify(g);
    for (const [, s] of text.matchAll(/"include":"((?:source|text)\.[\w.-]+)/g)) await visit(s);
  };
  await visit(root);
  return { scope: root, grammars };
}
