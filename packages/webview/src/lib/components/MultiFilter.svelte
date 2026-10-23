<script lang="ts">
  import { Check, ChevronDown } from '@lucide/svelte';
  import { Button } from '$lib/components/ui/button';
  import * as Command from '$lib/components/ui/command';
  import * as Popover from '$lib/components/ui/popover';
  import { cn } from '$lib/utils';
  import type { Hint } from './Tip.svelte';

  /** A searchable multi-select (or `single`-select); an empty selection is `allLabel`. */
  let {
    items,
    selected,
    noun,
    onchange,
    single = false,
    allLabel = 'Show All',
    hint
  }: {
    items: string[];
    selected: string[];
    noun: string;
    onchange: (v: string[]) => void;
    single?: boolean;
    allLabel?: string;
    hint?: Hint;
  } = $props();

  let open = $state(false);
  const label = $derived(
    selected.length === 0
      ? allLabel
      : selected.length === 1
        ? selected[0]
        : `${selected.length} ${noun}`
  );

  function toggle(item: string) {
    if (single) {
      onchange([item]);
      open = false;
    } else
      onchange(selected.includes(item) ? selected.filter((s) => s !== item) : [...selected, item]);
  }
</script>

<Popover.Root bind:open>
  <Popover.Trigger>
    {#snippet child({ props })}
      <Button {...props} {hint} variant="outline" size="xs" class="max-w-56 justify-between">
        <span class="truncate">{label}</span>
        <ChevronDown class="size-3 opacity-60" />
      </Button>
    {/snippet}
  </Popover.Trigger>
  <Popover.Content class="w-72 p-0" align="start">
    <Command.Root>
      <Command.Input placeholder="Filter {noun}…" class="h-8 text-[13px] md:text-[13px]" />
      <Command.List class="max-h-80">
        <Command.Empty>No {noun}.</Command.Empty>
        {#if !single}
          <Command.Item value="__all" class="py-1 text-[13px]" onSelect={() => onchange([])}>
            <Check class={cn('size-4', selected.length !== 0 && 'invisible')} />
            {allLabel}
          </Command.Item>
        {/if}
        {#each items as item (item)}
          <Command.Item value={item} class="py-1 text-[13px]" onSelect={() => toggle(item)}>
            <Check class={cn('size-4', !selected.includes(item) && 'invisible')} />
            <span class="truncate">{item}</span>
          </Command.Item>
        {/each}
      </Command.List>
    </Command.Root>
  </Popover.Content>
</Popover.Root>
