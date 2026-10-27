/**
 * Code colored as the editor colors it: Shiki, fed the editor's own color theme and the grammars of
 * its installed extensions (the host reads both, see `codeColors.ts`). Plain text when either is
 * missing, or a grammar won't load.
 */
import { createHighlighterCore, type HighlighterCore, type ThemedToken } from '@shikijs/core';
import { createJavaScriptRegexEngine } from '@shikijs/engine-javascript';
import { host } from './rpc';

export type { ThemedToken };

let core: Promise<{ hl: HighlighterCore; theme: string } | null> | null = null;
/** The grammar's scope by file kind (see `kind`), once asked for. */
let langs = new Map<string, Promise<string | null>>();

function load() {
  return (core ??= (async () => {
    const theme = await host.getCodeTheme();
    if (!theme) return null;
    const hl = await createHighlighterCore({
      themes: [],
      langs: [],
      // Regexes the JavaScript engine can't run are skipped rather than failing the grammar
      engine: createJavaScriptRegexEngine({ forgiving: true })
    });
    await hl.loadTheme({ ...theme, settings: theme.tokenColors } as never);
    return { hl, theme: theme.name };
  })().catch(() => null));
}

/** The theme changed: the next diff loads it (and the grammars) again. */
export function resetHighlighter() {
  core = null;
  langs = new Map();
}

/** One grammar serves every file of a kind: its last extension, or its name (Dockerfile). */
const kind = (path: string) => {
  const name = path.split('/').pop()!.toLowerCase();
  return name.includes('.') ? name.slice(name.lastIndexOf('.')) : name;
};

function lang(hl: HighlighterCore, file: string) {
  const k = kind(file);
  if (!langs.has(k))
    langs.set(
      k,
      host
        .getGrammars(file)
        .then(async (g) => {
          if (!g) return null;
          const loaded = new Set(hl.getLoadedLanguages());
          // Each by its scope name: that's how grammars include each other
          const fresh = g.grammars
            .filter((x) => !loaded.has(x.scopeName as string))
            .map((x) => ({ ...x, name: x.scopeName }));
          if (fresh.length) await hl.loadLanguage(...(fresh as never[]));
          return g.scope;
        })
        .catch(() => null)
    );
  return langs.get(k)!;
}

/**
 * The tokens of each line, colored by the theme; null to show them plain. The lines are read as one
 * piece of code, so a comment or string spanning lines is colored throughout.
 */
export async function tokenize(file: string, lines: string[]): Promise<ThemedToken[][] | null> {
  const c = await load();
  const scope = c && (await lang(c.hl, file));
  if (!c || !scope) return null;
  try {
    return c.hl.codeToTokensBase(lines.join('\n'), {
      lang: scope,
      theme: c.theme,
      // Minified lines: plain past this length
      tokenizeMaxLineLength: 1000
    });
  } catch {
    return null;
  }
}
