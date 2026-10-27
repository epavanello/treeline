/** The editor's color theme and grammars, from the installed extensions (see `codeColors.ts`). */
import * as vscode from 'vscode';
import type { CodeTheme } from '@treeline/shared';
import { grammarsOf, themeOf, type Extension } from './codeColors';

const installed = (): Extension[] =>
  vscode.extensions.all.map((e) => ({
    dir: e.extensionPath,
    contributes: (e.packageJSON as { contributes?: Extension['contributes'] }).contributes ?? {}
  }));

/** The active color theme, with the user's `editor.tokenColorCustomizations`; null if not found. */
export function activeTheme(): Promise<CodeTheme | null> {
  const id = vscode.workspace.getConfiguration('workbench').get<string>('colorTheme') ?? '';
  type Rules = { textMateRules?: unknown[] };
  const custom = vscode.workspace
    .getConfiguration('editor')
    .get<Rules & Record<string, Rules>>('tokenColorCustomizations');
  const kind = vscode.window.activeColorTheme.kind;
  const light =
    kind === vscode.ColorThemeKind.Light || kind === vscode.ColorThemeKind.HighContrastLight;
  return themeOf(installed(), id, light ? 'light' : 'dark', [
    ...(custom?.textMateRules ?? []),
    ...(custom?.[`[${id}]`]?.textMateRules ?? [])
  ]);
}

export const grammarsFor = (file: string) => grammarsOf(installed(), file);
