<script lang="ts">
  import type { RefSummary } from '@treeline/shared';
  import { CloudDownload, CloudOff, CloudUpload } from '@lucide/svelte';
  import { app } from '$lib/app.svelte';

  /**
   * Where a branch stands, compactly: ↑ ahead / ↓ behind the compare base (green / blue, as in the
   * compare bar), then its remote: ☁↑ commits to push, ☁↓ to pull, a crossed cloud if never pushed.
   */
  let { r }: { r: RefSummary } = $props();

  const base = $derived(app.data?.compare?.base);
  const up = $derived(r.ref.kind === 'head' ? r.ref.upstream : undefined);
  // Digits sit on the baseline: nudge the icons onto them (see WorktreeState)
  const icon = 'size-3 translate-y-[0.5px]';
</script>

<span class="inline-flex shrink-0 items-center gap-1.5 text-[11px] leading-none tabular-nums">
  {#if r.vsBase?.ahead}
    <span class="text-ahead" title="{r.vsBase.ahead} commits not on {base}">↑{r.vsBase.ahead}</span>
  {/if}
  {#if r.vsBase?.behind}
    <span class="text-behind" title="{r.vsBase.behind} commits on {base} it doesn't have"
      >↓{r.vsBase.behind}</span
    >
  {/if}
  {#if r.ref.kind === 'head'}
    {#if !up || up.gone}
      <span
        class="inline-flex opacity-60"
        title={up ? `${up.name} was deleted on the remote` : 'Never pushed: no upstream branch'}
        ><CloudOff class={icon} /></span
      >
    {:else}
      {#if up.ahead}
        <span
          class="inline-flex items-center gap-0.5"
          title="{up.ahead} commits to push to {up.name}"
        >
          <CloudUpload class={icon} />{up.ahead}
        </span>
      {/if}
      {#if up.behind}
        <span
          class="inline-flex items-center gap-0.5"
          title="{up.behind} commits to pull from {up.name}"
        >
          <CloudDownload class={icon} />{up.behind}
        </span>
      {/if}
    {/if}
  {/if}
</span>
