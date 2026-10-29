<script lang="ts">
  import type { Snippet } from 'svelte';
  import { ListFilter, LoaderCircle } from '@lucide/svelte';
  import { Button } from '$lib/components/ui/button';
  import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
  import { cn } from '$lib/utils';
  import type { Hint } from './Tip.svelte';

  /**
   * A horizontally scrolling row of chips under the toolbar (worktrees, branches, tags). The title and
   * its count (left) and its action (+, right) stay pinned in a fixed-width cell, so every row's chips
   * start at the same place and scroll under it through a fade. With no items it says so.
   * With a `filter`, the title opens it, and the count reads "shown/all" while it hides some.
   */
  let {
    label,
    count,
    shown = count,
    empty,
    children,
    action,
    filter
  }: {
    label: string;
    count: number;
    /** How many chips the filter lets through. */
    shown?: number;
    /** Shown instead of the chips when there are none (a snippet: a button to get some). */
    empty: string | Snippet;
    children: Snippet;
    action?: Snippet;
    filter?: {
      menu: Snippet;
      /** The filter differs from its default. */
      active: boolean;
      /** Its data is still loading, so it may let more through soon. */
      loading?: boolean;
      hint: Hint;
    };
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
    class="sticky left-0 z-10 flex h-full w-36 shrink-0 items-center gap-1 bg-linear-to-r from-background from-[89%] to-transparent pr-4 pl-2 text-muted-foreground"
  >
    {#snippet title()}
      <!-- One inline run: the smaller count sits on the label's baseline -->
      <span
        >{label}<span class="ml-1 text-[10px] tabular-nums"
          >{shown === count ? count : `${shown}/${count}`}</span
        ></span
      >
    {/snippet}
    {#if filter}
      <DropdownMenu.Root>
        <DropdownMenu.Trigger>
          {#snippet child({ props })}
            <Button
              {...props}
              variant="ghost"
              size="xs"
              class="-ml-1 h-6 gap-1 px-1 text-xs font-normal text-muted-foreground"
              hint={filter.hint}
            >
              {@render title()}
              {#if filter.loading && filter.active}
                <LoaderCircle class="size-3 animate-spin" />
              {:else}
                <ListFilter class={cn('size-3', filter.active ? 'text-link' : 'opacity-50')} />
              {/if}
            </Button>
          {/snippet}
        </DropdownMenu.Trigger>
        <DropdownMenu.Content align="start" class="w-60">
          {@render filter.menu()}
        </DropdownMenu.Content>
      </DropdownMenu.Root>
    {:else}
      {@render title()}
    {/if}
    <span class="ml-auto">{@render action?.()}</span>
  </span>
  <div class="flex items-center gap-1.5">
    {#if shown}
      {@render children()}
    {:else}
      {#if typeof empty === 'string'}
        <span class="text-muted-foreground">{empty}</span>
      {:else}
        {@render empty()}
      {/if}
    {/if}
  </div>
</div>
