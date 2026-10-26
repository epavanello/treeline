<script lang="ts" generics="T extends { [K in keyof T]: string }">
  import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
  import Tip, { type Hint } from './Tip.svelte';

  /**
   * A row's filter, as groups of options (one choice per group) in its title's dropdown. Picking
   * keeps the menu open, to combine groups.
   */
  let {
    groups,
    value,
    onchange,
    onreset
  }: {
    groups: {
      key: keyof T & string;
      label: string;
      options: { value: string; label: string; hint?: Hint; disabled?: boolean }[];
    }[];
    value: T;
    onchange: (patch: Partial<T>) => void;
    onreset: () => void;
  } = $props();
</script>

{#each groups as g, i (g.key)}
  {#if i}<DropdownMenu.Separator />{/if}
  <DropdownMenu.Label class="py-1 text-xs font-normal text-muted-foreground"
    >{g.label}</DropdownMenu.Label
  >
  <DropdownMenu.RadioGroup
    value={value[g.key]}
    onValueChange={(v) => onchange({ [g.key]: v } as Partial<T>)}
  >
    {#each g.options as o (o.value)}
      <Tip hint={o.hint} side="right">
        {#snippet children(trigger)}
          <DropdownMenu.RadioItem
            {...trigger}
            value={o.value}
            disabled={o.disabled}
            closeOnSelect={false}
            class="py-1 text-[13px]"
          >
            {o.label}
          </DropdownMenu.RadioItem>
        {/snippet}
      </Tip>
    {/each}
  </DropdownMenu.RadioGroup>
{/each}
<DropdownMenu.Separator />
<DropdownMenu.Item class="py-1 text-[13px]" onSelect={onreset}>Show everything</DropdownMenu.Item>
