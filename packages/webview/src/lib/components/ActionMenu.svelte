<script lang="ts">
  import type { Snippet } from 'svelte';
  import * as ContextMenu from '$lib/components/ui/context-menu';
  import type { MenuItem } from '$lib/menus';
  import Tip from './Tip.svelte';

  /**
   * One context menu for a whole area. Children call `open(items)` from their
   * own `oncontextmenu`; the innermost element wins (e.g. a badge inside a row).
   */
  let { children }: { children: Snippet<[open: (e: MouseEvent, items: MenuItem[]) => void]> } =
    $props();

  let items = $state<MenuItem[]>([]);
  let menuOpen = $state(false);
  /** Set by a click that closed the menu, so that click does nothing else. */
  let swallow = false;

  // bits-ui ignores clicks inside the trigger, and our trigger is the whole area (a list, a row
  // of chips): close on a left click there too, consuming it like a native menu does.
  function onpointerdowncapture(e: PointerEvent) {
    swallow = menuOpen && e.button === 0;
    if (swallow) menuOpen = false;
  }
  // A right-click that no element claimed (a row title, empty space): no menu, and any open one
  // closes. bits-ui skips a contextmenu event that is already default-prevented.
  function oncontextmenu(e: MouseEvent) {
    if (claimed.has(e)) return;
    e.preventDefault();
    // After the event: the open menu's own handlers would otherwise keep it open
    setTimeout(() => (menuOpen = false));
  }
  function onclickcapture(e: MouseEvent) {
    if (!swallow) return;
    swallow = false;
    e.stopPropagation();
    e.preventDefault();
  }
  const claimed = new WeakSet<Event>();

  /** The element the open menu belongs to: highlighted until the menu closes (see app.css). */
  let target: HTMLElement | null = null;
  function mark(el: HTMLElement | null) {
    target?.removeAttribute('data-menu-open');
    target = el;
    target?.setAttribute('data-menu-open', '');
  }
  $effect(() => {
    if (!menuOpen) mark(null);
  });

  function open(e: MouseEvent, next: MenuItem[]) {
    if (claimed.has(e)) return;
    claimed.add(e);
    // Drop leading, trailing and repeated separators left by conditional items
    items = next.filter(
      (item, i, all) =>
        item !== 'separator' || (i > 0 && i < all.length - 1 && all[i - 1] !== 'separator')
    );
    let el = e.currentTarget as HTMLElement | null;
    // A `display: contents` wrapper has no box of its own: highlight what it wraps
    if (el && getComputedStyle(el).display === 'contents') el = el.firstElementChild as HTMLElement;
    mark(el);
  }
</script>

<ContextMenu.Root bind:open={menuOpen}>
  <ContextMenu.Trigger class="contents" {oncontextmenu} {onpointerdowncapture} {onclickcapture}>
    {@render children(open)}
  </ContextMenu.Trigger>
  <ContextMenu.Content class="min-w-56">
    {#each items as item, i (i)}
      {#if item === 'separator'}
        <ContextMenu.Separator />
      {:else}
        <Tip hint={item.hint} side="right">
          {#snippet children(trigger)}
            <ContextMenu.Item {...trigger} onSelect={() => void item.run()}>
              {item.label}
            </ContextMenu.Item>
          {/snippet}
        </Tip>
      {/if}
    {/each}
  </ContextMenu.Content>
</ContextMenu.Root>
