<script lang="ts">
  import { Check, Copy } from '@lucide/svelte';
  import { host } from '$lib/rpc';

  /** A value to read whole, select or copy with one click: a folder, a commit hash. */
  let { value, what }: { value: string; what: string } = $props();
  let copied = $state(false);

  function copy() {
    void host.copy(value);
    copied = true;
    setTimeout(() => (copied = false), 1500);
  }
</script>

<span class="flex min-w-0 items-center gap-1">
  <input
    readonly
    {value}
    title={value}
    class="h-6 min-w-0 flex-1 rounded-sm border bg-muted/40 px-1.5 font-mono text-[11px] text-muted-foreground outline-none focus:border-ring"
    onfocus={(e) => e.currentTarget.select()}
  />
  <button
    class="shrink-0 rounded-sm p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
    title="Copy the {what}"
    onclick={copy}
  >
    {#if copied}<Check class="size-3.5 text-ahead" />{:else}<Copy class="size-3.5" />{/if}
  </button>
</span>
