<script lang="ts">
  import type { Snippet } from 'svelte';

  /**
   * A horizontally scrolling row of chips under the toolbar (worktrees, branches, tags). The title
   * and the action stay pinned at the ends; chips scroll under them through a fade.
   */
  let { label, children, action }: { label: string; children: Snippet; action?: Snippet } =
    $props();

  // A plain vertical mouse wheel scrolls the row sideways
  function onwheel(e: WheelEvent) {
    const row = e.currentTarget as HTMLElement;
    if (Math.abs(e.deltaY) <= Math.abs(e.deltaX) || row.scrollWidth <= row.clientWidth) return;
    row.scrollLeft += e.deltaY;
    e.preventDefault();
  }
</script>

<div
  class="flex h-8 shrink-0 items-center overflow-x-auto border-b text-xs [scrollbar-width:none]"
  {onwheel}
>
  <span
    class="sticky left-0 z-10 flex h-full shrink-0 items-center bg-linear-to-r from-background from-70% to-transparent pr-5 pl-2 text-muted-foreground min-w-20"
  >
    {label}
  </span>
  <div class="flex items-center gap-1.5">
    {@render children()}
  </div>
  <span
    class="sticky right-0 z-10 ml-auto flex h-full shrink-0 items-center bg-linear-to-l from-background from-60% to-transparent pr-1 pl-5"
  >
    {@render action?.()}
  </span>
</div>
