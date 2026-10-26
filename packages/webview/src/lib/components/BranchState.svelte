<script lang="ts">
  import type { RefSummary } from '@treeline/shared';
  import { Cloud, CloudOff } from '@lucide/svelte';
  import { app } from '$lib/app.svelte';
  import { cn } from '$lib/utils';

  /**
   * Where a branch stands, compactly: ↑ ahead / ↓ behind the compare base (green / blue, as in the
   * compare bar), then where it lives. A filled cloud: on your machine and on the remote, with ↑ to
   * push and ↓ to pull when they differ. An outline cloud: only on the remote. A crossed cloud: only
   * here, never pushed, or (in the warning color) deleted on the remote.
   */
  let { r }: { r: RefSummary } = $props();

  const base = $derived(app.data?.compare?.base);
  const row = $derived(app.rowOf.get(r.ref.name));
  const up = $derived(row?.local?.ref.upstream);
  const where = $derived(
    row?.local && row.remote
      ? 'both'
      : r.ref.kind === 'remote'
        ? 'remote'
        : up?.gone
          ? 'gone'
          : 'local'
  );
  const title = $derived(
    where === 'both'
      ? `On your machine and on ${row!.remote!.ref.remote ?? 'the remote'} as ${row!.remote!.ref.name}` +
          (up && (up.ahead || up.behind)
            ? `: ${[up.ahead && `${up.ahead} to push`, up.behind && `${up.behind} to pull`].filter(Boolean).join(', ')}`
            : up
              ? ', in sync'
              : '')
      : where === 'remote'
        ? `Only on ${r.ref.remote ?? 'the remote'}: not on your machine`
        : where === 'gone'
          ? `${up!.name} was deleted on the remote: only here now`
          : 'Only on your machine: never pushed'
  );
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
  <span
    class={cn(
      'inline-flex items-center gap-0.5',
      where === 'gone' ? 'text-dirty' : where === 'both' ? '' : 'opacity-60'
    )}
    {title}
  >
    {#if where === 'both'}
      <Cloud class="{icon} fill-current" />
      {#if up?.ahead}↑{up.ahead}{/if}
      {#if up?.behind}↓{up.behind}{/if}
    {:else if where === 'remote'}
      <Cloud class={icon} />
    {:else}
      <CloudOff class={icon} />
    {/if}
  </span>
</span>
