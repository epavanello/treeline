<script lang="ts">
  import { cn } from '$lib/utils';

  /** Lines added and removed, and five blocks sharing them out, as pull requests show them; nothing when not counted (binary, untracked). */
  let {
    additions,
    deletions,
    class: className
  }: { additions: number | null; deletions: number | null; class?: string } = $props();

  const total = $derived((additions ?? 0) + (deletions ?? 0));
  const added = $derived(total ? Math.round((5 * additions!) / total) : 0);
  const removed = $derived(total ? 5 - added : 0);
</script>

{#if additions !== null}
  <span
    class={cn('inline-flex items-center gap-1.5 font-mono text-[11px] tabular-nums', className)}
    title="{additions} lines added, {deletions} removed"
  >
    <span class="text-[var(--vscode-gitDecoration-addedResourceForeground)]">+{additions}</span>
    <span class="text-[var(--vscode-gitDecoration-deletedResourceForeground)]">−{deletions}</span>
    <span class="flex gap-px">
      {#each { length: 5 } as _, i (i)}
        <span
          class={cn(
            'size-[7px] rounded-[1px]',
            i < added
              ? 'bg-[var(--vscode-gitDecoration-addedResourceForeground)]'
              : i < added + removed
                ? 'bg-[var(--vscode-gitDecoration-deletedResourceForeground)]'
                : 'bg-muted-foreground/25'
          )}
        ></span>
      {/each}
    </span>
  </span>
{/if}
