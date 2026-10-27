<script lang="ts">
  import type { FileChange } from '@treeline/shared';
  import { ChevronRight, FileDiff } from '@lucide/svelte';
  import { app } from '$lib/app.svelte';
  import { tokenize, type ThemedToken } from '$lib/highlight';
  import type { PatchFile } from '$lib/patch';
  import { cn } from '$lib/utils';
  import { Button } from '$lib/components/ui/button';
  import DiffStat from './DiffStat.svelte';
  import { STATUS_COLOR } from '$lib/fileStatus';

  /**
   * One file of the inline diff: a sticky header (click: fold; its name: the editor's diff), then
   * its hunks, numbered on both sides and colored as the editor colors that language.
   */
  let {
    file,
    change,
    open,
    ontoggle,
    onopen,
    oncontextmenu
  }: {
    file: PatchFile;
    change: FileChange;
    open: boolean;
    ontoggle: () => void;
    onopen: () => void;
    oncontextmenu: (e: MouseEvent) => void;
  } = $props();

  /** Each hunk's lines' tokens, once colored (null: plain text). */
  let tokens = $state.raw<((ThemedToken[] | undefined)[] | null)[] | null>(null);

  $effect(() => {
    void app.themeVersion;
    if (!open || file.binary) return;
    let stale = false;
    const f = file;
    // Each side of a hunk is read as one piece of code: the new side (context and added lines) and
    // the old one (context and removed lines)
    void Promise.all(
      f.hunks.map(async (h) => {
        const removed = h.lines.some((l) => l.kind === '-');
        const [after, before] = await Promise.all([
          tokenize(
            f.path,
            h.lines.filter((l) => l.kind !== '-').map((l) => l.text)
          ),
          removed
            ? tokenize(
                f.oldPath,
                h.lines.filter((l) => l.kind !== '+').map((l) => l.text)
              )
            : null
        ]);
        if (!after) return null;
        let a = 0;
        let b = 0;
        return h.lines.map((l) =>
          l.kind === '-' ? before?.[b++] : l.kind === '+' ? after[a++] : (b++, after[a++])
        );
      })
    ).then((t) => {
      if (!stale) tokens = t.some(Boolean) ? t : null;
    });
    return () => (stale = true);
  });

  const count = (kind: '+' | '-') =>
    file.hunks.reduce((n, h) => n + h.lines.filter((l) => l.kind === kind).length, 0);
  const digits = $derived(
    String(
      Math.max(
        0,
        ...file.hunks.flatMap((h) => h.lines.map((l) => Math.max(l.old ?? 0, l.new ?? 0)))
      )
    ).length
  );
  const dir = $derived(
    file.path.includes('/') ? file.path.slice(0, file.path.lastIndexOf('/') + 1) : ''
  );
  const name = $derived(file.path.slice(dir.length));
  const LINE = {
    '+': 'bg-[var(--vscode-diffEditor-insertedLineBackground,rgba(155,185,85,0.2))]',
    '-': 'bg-[var(--vscode-diffEditor-removedLineBackground,rgba(255,0,0,0.2))]',
    ' ': ''
  };
  const GUTTER = {
    '+': 'bg-[var(--vscode-diffEditorGutter-insertedLineBackground,rgba(155,185,85,0.3))]',
    '-': 'bg-[var(--vscode-diffEditorGutter-removedLineBackground,rgba(255,0,0,0.3))]',
    ' ': ''
  };
</script>

<section class="border-b">
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
  <header
    class="sticky top-0 z-10 flex h-7 cursor-pointer items-center gap-1.5 border-b bg-card px-2 text-[12px] hover:shadow-[inset_0_0_0_100vmax_var(--accent)] data-menu-open:shadow-[inset_0_0_0_100vmax_var(--accent)]"
    onclick={ontoggle}
    {oncontextmenu}
  >
    <ChevronRight
      class={cn(
        'size-3.5 shrink-0 text-muted-foreground transition-transform',
        open && 'rotate-90'
      )}
    />
    <span class={cn('w-3 shrink-0 font-mono text-xs font-bold', STATUS_COLOR[change.status])}
      >{change.status}</span
    >
    <button
      class="min-w-0 truncate text-left hover:underline"
      title="Open this diff in the editor: {file.path}"
      onclick={(e) => (e.stopPropagation(), onopen())}
    >
      {#if file.oldPath !== file.path}<span class="text-muted-foreground"
          >{file.oldPath} →
        </span>{/if}<span class="text-muted-foreground">{dir}</span><span class="font-semibold"
        >{name}</span
      >
    </button>
    <span class="ml-auto shrink-0"
      ><DiffStat
        additions={file.binary ? null : count('+')}
        deletions={file.binary ? null : count('-')}
      /></span
    >
    <Button
      variant="ghost"
      size="icon-xs"
      icon={FileDiff}
      hint="Open this diff in the editor, side by side: when a side matches your working tree it's the real file, so Go to Definition, errors and links work there."
      onclick={(e: MouseEvent) => (e.stopPropagation(), onopen())}
    />
  </header>

  {#if open}
    {#if file.binary}
      <p class="px-3 py-2 text-xs text-muted-foreground">Binary file: open it to see it.</p>
    {:else if !file.hunks.length}
      <p class="px-3 py-2 text-xs text-muted-foreground">
        {file.oldPath !== file.path ? 'Renamed, content unchanged.' : 'No changes to its text.'}
      </p>
    {:else}
      <div
        class="overflow-x-auto py-0.5 text-[12px] leading-[18px]"
        style="font-family: var(--vscode-editor-font-family, ui-monospace, monospace)"
      >
        <div class="w-max min-w-full">
          {#each file.hunks as h, hi (hi)}
            <!-- Lines left out above: a band, naming the function or class they're in when git knows -->
            {#if (h.lines[0]?.old ?? h.lines[0]?.new ?? 1) > 1}
              <div
                class="flex min-h-1.5 bg-[var(--vscode-diffEditor-unchangedRegionBackground,var(--muted))] text-muted-foreground"
              >
                {#if h.context}
                  <span class="shrink-0 select-none" style="width: {2 * digits + 4}ch"></span>
                  <span class="truncate py-px pr-4 text-[11px]">{h.context}</span>
                {/if}
              </div>
            {/if}
            {#each h.lines as l, li (li)}
              {@const t = tokens?.[hi]?.[li]}
              <div class={cn('flex', LINE[l.kind])}>
                <span
                  class={cn(
                    'shrink-0 pr-1 text-right text-muted-foreground/70 select-none',
                    GUTTER[l.kind]
                  )}
                  style="width: {digits + 1}ch">{l.old ?? ''}</span
                >
                <span
                  class={cn(
                    'shrink-0 pr-1 text-right text-muted-foreground/70 select-none',
                    GUTTER[l.kind]
                  )}
                  style="width: {digits + 1}ch">{l.new ?? ''}</span
                >
                <span class="w-[2ch] shrink-0 text-center text-muted-foreground select-none"
                  >{l.kind === ' ' ? '' : l.kind}</span
                >
                <span class="pr-4 whitespace-pre"
                  >{#if t}{#each t as tok, ti (ti)}<span
                        style:color={tok.color}
                        class={cn(
                          tok.fontStyle! & 1 && 'italic',
                          tok.fontStyle! & 2 && 'font-bold'
                        )}>{tok.content}</span
                      >{/each}{:else}{l.text}{/if}</span
                >
              </div>
            {/each}
          {/each}
        </div>
      </div>
    {/if}
  {/if}
</section>
