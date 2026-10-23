<script lang="ts">
  import type { Snippet } from 'svelte';
  import * as ContextMenu from '$lib/components/ui/context-menu';
  import type { MenuItem } from '$lib/menus';

  /**
   * One context menu for a whole area. Children call `open(items)` from their
   * own `oncontextmenu`; the innermost element wins (e.g. a badge inside a row).
   */
  let { children }: { children: Snippet<[open: (e: MouseEvent, items: MenuItem[]) => void]> } =
    $props();

  let items = $state<MenuItem[]>([]);
  const claimed = new WeakSet<Event>();

  function open(e: MouseEvent, next: MenuItem[]) {
    if (claimed.has(e)) return;
    claimed.add(e);
    // Drop leading, trailing and repeated separators left by conditional items
    items = next.filter(
      (item, i, all) =>
        item !== 'separator' || (i > 0 && i < all.length - 1 && all[i - 1] !== 'separator')
    );
  }
</script>

<ContextMenu.Root>
  <ContextMenu.Trigger class="contents">
    {@render children(open)}
  </ContextMenu.Trigger>
  <ContextMenu.Content class="min-w-56">
    {#each items as item, i (i)}
      {#if item === 'separator'}
        <ContextMenu.Separator />
      {:else}
        <ContextMenu.Item onSelect={() => void item.run()}>{item.label}</ContextMenu.Item>
      {/if}
    {/each}
  </ContextMenu.Content>
</ContextMenu.Root>
