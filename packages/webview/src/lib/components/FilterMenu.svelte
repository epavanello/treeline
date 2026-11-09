<script lang="ts" generics="T extends { [K in keyof T]: string }">
  import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
  import { Search } from '@lucide/svelte';
  import Tip, { type Hint } from './Tip.svelte';

  /**
   * A row's filter, as groups of options (one choice per group) in its title's dropdown. Picking
   * keeps the menu open, to combine groups. With a `search` placeholder, a text field on top
   * filters by name (`value.text`), focused when the menu opens: paste a name and see only that.
   */
  let {
    groups,
    value,
    onchange,
    onreset,
    search
  }: {
    groups: {
      key: keyof T & string;
      label: string;
      options: { value: string; label: string; hint?: Hint; disabled?: boolean }[];
    }[];
    value: T;
    onchange: (patch: Partial<T>) => void;
    onreset: () => void;
    search?: string;
  } = $props();
  const text = $derived((value as { text?: string }).text ?? '');
  let input = $state<HTMLInputElement>();

  // Hovering an option focuses it: typing (or pasting) still goes to the text field
  function onkeydowncapture(e: KeyboardEvent) {
    if (!input || document.activeElement === input) return;
    const mod = e.metaKey || e.ctrlKey;
    const typing = e.key.length === 1 && e.key !== ' ' && !mod && !e.altKey;
    if (typing || e.key === 'Backspace' || (mod && e.key.toLowerCase() === 'v')) {
      input.focus();
      e.stopPropagation();
    }
  }
</script>

<svelte:window {onkeydowncapture} />

{#if search}
  <div class="relative px-1 pt-1 pb-1.5">
    <Search
      class="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 opacity-50"
    />
    <input
      bind:this={input}
      {@attach (el) => {
        // After the menu has focused itself; selected, so a paste replaces the last search
        requestAnimationFrame(() => (el.focus(), el.select()));
      }}
      value={text}
      placeholder={search}
      spellcheck="false"
      class="h-7 w-full rounded-sm border border-input bg-background pr-2 pl-7 text-[13px] outline-none placeholder:text-muted-foreground focus-visible:border-ring"
      oninput={(e) => onchange({ text: e.currentTarget.value } as unknown as Partial<T>)}
      onkeydown={(e) => {
        // The menu's typeahead and arrow keys would steal the keys; Escape still closes it
        if (e.key !== 'Escape') e.stopPropagation();
      }}
    />
  </div>
  <DropdownMenu.Separator />
{/if}

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
