<script lang="ts">
  import type { Snippet } from 'svelte';
  import { ListFilter, LoaderCircle } from '@lucide/svelte';
  import { Button } from '$lib/components/ui/button';
  import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
  import { cn } from '$lib/utils';
  import type { Hint } from './Tip.svelte';

  /**
   * A horizontally scrolling row of chips under the toolbar (worktrees, branches, tags). The title, its
   * count, its filter and its action (+) stay pinned in a fixed-width cell of four columns, so every
   * row's chips start at the same place, its icons line up, and the chips scroll under it through a fade. With no items it says so.
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
  <!--
    The same four columns on every row, so they line up: the name (cut short if it must), its count
    (right-aligned), the filter and the action. A row without a filter or an action keeps its slot.
  -->
  <span
    class="sticky left-0 z-10 grid h-full w-48 shrink-0 grid-cols-[minmax(0,1fr)_auto_1.5rem_1.5rem] items-center gap-x-1 bg-linear-to-r from-background from-[90%] to-transparent pr-3 pl-2 text-muted-foreground"
  >
    {#snippet title()}
      <span class="truncate text-left">{label}</span>
      <span class="text-right text-[10px] tabular-nums"
        >{shown === count ? count : `${shown}/${count}`}</span
      >
    {/snippet}
    {#if filter}
      <DropdownMenu.Root>
        <DropdownMenu.Trigger>
          {#snippet child({ props })}
            <!-- Name, count and icon share the row's columns (subgrid): one button over all three -->
            <Button
              {...props}
              variant="ghost"
              size="xs"
              class="col-span-3 -ml-1 grid h-6 grid-cols-subgrid items-center gap-x-1 pl-1 text-xs font-normal text-muted-foreground has-[>svg]:pl-1 has-[>svg]:pr-0"
              hint={filter.hint}
            >
              {@render title()}
              {#if filter.loading && filter.active}
                <LoaderCircle class="size-3 justify-self-center animate-spin" />
              {:else}
                <ListFilter
                  class={cn(
                    'size-3 justify-self-center',
                    filter.active ? 'text-link' : 'opacity-50'
                  )}
                />
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
      <span></span>
    {/if}
    <span class="flex justify-center">{@render action?.()}</span>
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
