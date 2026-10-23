<script lang="ts">
  import type { Snippet } from 'svelte';

  /**
   * A horizontally scrolling row of chips under the toolbar (worktrees, branches, tags). The title,
   * its count and its action (+) stay pinned on the left in a fixed-width cell, so every row's chips
   * start at the same place and scroll under it through a fade. With no items it says so.
   */
  let {
    label,
    count,
    empty,
    children,
    action
  }: {
    label: string;
    count: number;
    /** Shown instead of the chips when there are none. */
    empty: string;
    children: Snippet;
    action?: Snippet;
  } = $props();

  // A plain vertical mouse wheel scrolls the row sideways
  function onwheel(e: WheelEvent) {
    const row = e.currentTarget as HTMLElement;
    if (Math.abs(e.deltaY) <= Math.abs(e.deltaX) || row.scrollWidth <= row.clientWidth) return;
    row.scrollLeft += e.deltaY;
    e.preventDefault();
  }
</script>

<div
  class="flex h-8 shrink-0 items-center overflow-x-auto border-b pr-2 text-xs [scrollbar-width:none]"
  {onwheel}
>
  <span
    class="sticky left-0 z-10 flex h-full w-30 shrink-0 items-center gap-1 bg-linear-to-r from-background from-75% to-transparent pr-4 pl-2 text-muted-foreground"
  >
    <!-- One inline run: the smaller count sits on the label's baseline -->
    <span>{label}<span class="ml-1 text-[10px] tabular-nums opacity-70">{count}</span></span>
    {@render action?.()}
  </span>
  <div class="flex items-center gap-1.5">
    {#if count}
      {@render children()}
    {:else}
      <span class="text-muted-foreground opacity-70">{empty}</span>
    {/if}
  </div>
</div>
