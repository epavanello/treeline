<script lang="ts">
  import type { FileChange } from '@treeline/shared';
  import { LoaderCircle } from '@lucide/svelte';
  import { SvelteSet } from 'svelte/reactivity';
  import { host } from '$lib/rpc';
  import { parsePatch, type PatchFile } from '$lib/patch';
  import DiffFile from './DiffFile.svelte';

  /**
   * Every change between two revisions on one scrolling page, as a pull request shows them: each
   * file's changed lines with a little context. Big and generated files start folded.
   */
  let {
    repo,
    from,
    to,
    files,
    onopen,
    menu
  }: {
    repo: string;
    from: string;
    to: string;
    /** The file list the panel shows: their status and line counts. */
    files: FileChange[];
    onopen: (f: FileChange) => void;
    menu: (e: MouseEvent, f: FileChange) => void;
  } = $props();

  let patch = $state.raw<PatchFile[] | null>(null);
  let error = $state<string | null>(null);
  /** Files folded or unfolded by hand, against their default. */
  const flipped = new SvelteSet<string>();

  $effect(() => {
    // The file list changes when the changes do (a refresh): load the patch again
    void files;
    let stale = false;
    error = null;
    host.getPatch(repo, from, to).then(
      (text) => !stale && (patch = parsePatch(text)),
      (e: Error) => !stale && (error = e.message)
    );
    return () => (stale = true);
  });

  const GENERATED =
    /(^|\/)(pnpm-lock\.yaml|package-lock\.json|yarn\.lock|[^/]+\.lock|[^/]+\.min\.(js|css))$/;
  /** Folded at first: generated files, and files with too many changed lines to read here. */
  const big = (f: PatchFile) =>
    GENERATED.test(f.path) || f.hunks.reduce((n, h) => n + h.lines.length, 0) > 400;
  const changeOf = (f: PatchFile): FileChange =>
    files.find((c) => c.path === f.path) ?? {
      status: 'M',
      path: f.path,
      oldPath: f.oldPath,
      additions: null,
      deletions: null
    };
</script>

{#if error}
  <p class="p-3 text-xs text-destructive">{error}</p>
{:else if !patch}
  <p class="flex items-center gap-1.5 p-3 text-xs text-muted-foreground">
    <LoaderCircle class="size-3.5 animate-spin" /> Loading the changes…
  </p>
{:else if !patch.length}
  <p class="p-3 text-xs text-muted-foreground">No changes.</p>
{:else}
  {#each patch as f (f.path)}
    {@const change = changeOf(f)}
    <DiffFile
      file={f}
      {change}
      open={big(f) === flipped.has(f.path)}
      ontoggle={() => (flipped.has(f.path) ? flipped.delete(f.path) : flipped.add(f.path))}
      onopen={() => onopen(change)}
      oncontextmenu={(e) => menu(e, change)}
    />
  {/each}
{/if}
