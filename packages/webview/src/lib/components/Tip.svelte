<script lang="ts" module>
  /**
   * What a control does: a plain sentence, or a title, what happens, what to watch out for,
   * the git command it runs, and a muted note (a path, how to use it).
   */
  export type Hint =
    string | { title?: string; body: string; warn?: string; command?: string; note?: string };
</script>

<script lang="ts">
  import type { Snippet } from 'svelte';
  import { mergeProps } from 'svelte-toolbelt';
  import { app } from '$lib/app.svelte';
  import * as Tooltip from '$lib/components/ui/tooltip';
  import { cn } from '$lib/utils';

  /**
   * Wraps one element in a tooltip showing `hint`. The element receives the trigger props:
   * spread them on it (a Button merges them itself, see its `hint` prop).
   */
  let {
    hint,
    content,
    side = 'bottom',
    children
  }: {
    hint?: Hint;
    /** Rich tooltip content, instead of a `hint`. */
    content?: Snippet;
    side?: 'top' | 'bottom' | 'left' | 'right';
    children: Snippet<[props: Record<string, unknown>]>;
  } = $props();

  const h = $derived(typeof hint === 'string' ? { body: hint } : hint);
  let open = $state(false);
</script>

{#if h || content}
  <!-- No tooltips while a context menu is open: hovering would bring them back over the menu -->
  <Tooltip.Root bind:open={() => open && !app.menuOpen, (v) => (open = v)}>
    <Tooltip.Trigger>
      {#snippet child({ props })}
        <!-- A context menu opening on the element replaces its tooltip -->
        {@render children(mergeProps(props, { oncontextmenu: () => (open = false) }))}
      {/snippet}
    </Tooltip.Trigger>
    <!-- Long tokens such as paths and branch names wrap only when they don't fit on a line -->
    <Tooltip.Content
      {side}
      sideOffset={4}
      class={cn(
        'flex flex-col gap-1 text-left [overflow-wrap:anywhere]',
        // Cards (rich content) get room for their two columns; hints wrap like sentences
        content ? 'w-[23rem] max-w-[calc(100vw-1rem)] gap-1.5' : 'max-w-80'
      )}
    >
      {#if content}
        {@render content()}
      {:else if h}
        {#if h.title}<p class="font-semibold">{h.title}</p>{/if}
        <p class="whitespace-pre-line">{h.body}</p>
        {#if h.warn}<p class="text-dirty">⚠ {h.warn}</p>{/if}
        {#if h.command}
          <code class="font-mono text-[11px] text-muted-foreground">{h.command}</code>
        {/if}
        {#if h.note}<p class="whitespace-pre-line text-muted-foreground">{h.note}</p>{/if}
      {/if}
    </Tooltip.Content>
  </Tooltip.Root>
{:else}
  {@render children({})}
{/if}
