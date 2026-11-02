<script lang="ts" module>
  /** Opened once, it stays open for every commit, worktree and diff after: a preference, not a selection. */
  const section = $state({ expanded: false });
</script>

<script lang="ts">
  import { ago, type ClaudeSession, type Worktree } from '@treeline/shared';
  import { BotMessageSquare, ChevronRight } from '@lucide/svelte';
  import { app, sessionDate, sessionDetail } from '$lib/app.svelte';
  import { host } from '$lib/rpc';
  import { cn } from '$lib/utils';
  import { SUB } from './RefCard.svelte';

  /**
   * The legend line for the Claude Code sessions behind some branches or a worktree
   * (`app.sessionsFor`): collapsed to a count until opened, then the latest few (open ones first,
   * archived ones dimmed), each one click from being continued in the desktop app or a terminal.
   * In the details panel opening it is remembered (`remember`); in a hover card it's for that card.
   */
  let {
    branches,
    worktree,
    remember = true
  }: {
    branches: (string | null | undefined)[];
    worktree?: Worktree;
    remember?: boolean;
  } = $props();

  const FEW = 3;
  let all = $state(false);
  let here = $state(false);

  const sessions = $derived(app.sessionsFor(branches, worktree));
  const expanded = $derived(remember ? section.expanded : here);
  const shown = $derived(all ? sessions : sessions.slice(0, FEW));
  const archivedCount = $derived(sessions.filter(({ s }) => s.archived).length);
  const latest = $derived(Math.max(...sessions.map(({ s }) => s.active)));
  const count = $derived(
    sessions.length === 1 ? 'A Claude session' : `${sessions.length} Claude sessions`
  );
</script>

{#snippet row(s: ClaudeSession, why: string)}
  <li>
    <button
      class={cn(
        'block w-full min-w-0 rounded-sm px-1 py-0.5 text-left hover:bg-accent',
        s.archived && 'opacity-60 hover:opacity-100'
      )}
      title={`${
        s.desktopId
          ? `Opens it in the Claude desktop app${s.archived ? ' (it stays archived)' : ''}`
          : `Runs claude --resume ${s.id} in a terminal, in ${s.cwd}`
      }. Last message ${ago(s.active)}.`}
      onclick={() => host.resumeClaudeSession(s)}
    >
      <span class={cn('block truncate text-[12px]', !s.archived && 'font-semibold')}>
        {s.title}
      </span>
      <span class={SUB}>{sessionDetail(s, why)}</span>
    </button>
  </li>
{/snippet}

{#if sessions.length}
  <dt><BotMessageSquare class="size-3.5" /></dt>
  <dd>
    <button
      class="flex items-center gap-1 text-left"
      onclick={() => (remember ? (section.expanded = !expanded) : (here = !expanded))}
    >
      <span class="font-semibold">{count}</span>
      <ChevronRight
        class={cn('size-3.5 text-muted-foreground transition-transform', expanded && 'rotate-90')}
      />
    </button>
    <span class={SUB}>
      {archivedCount
        ? `${sessions.length - archivedCount} open, ${archivedCount} archived · `
        : ''}latest
      {sessionDate(latest)}{expanded ? ' · click one to continue it' : ''}
    </span>
    {#if expanded}
      {@const open = shown.filter(({ s }) => !s.archived)}
      {@const archived = shown.filter(({ s }) => s.archived)}
      {#if open.length}
        <ul class="mt-1 flex flex-col gap-1">
          {#each open as { s, why } (s.id)}{@render row(s, why)}{/each}
        </ul>
      {/if}
      {#if archived.length}
        <span class="mt-1.5 block text-[10px] tracking-wide text-muted-foreground uppercase">
          Archived
        </span>
        <ul class="flex flex-col gap-1">
          {#each archived as { s, why } (s.id)}{@render row(s, why)}{/each}
        </ul>
      {/if}
      {#if sessions.length > FEW}
        <button
          class="mt-1 text-[11px] text-link hover:text-link-hover hover:underline"
          onclick={() => (all = !all)}
        >
          {all ? 'Show fewer' : `Show all ${sessions.length}`}
        </button>
      {/if}
    {/if}
  </dd>
{/if}
