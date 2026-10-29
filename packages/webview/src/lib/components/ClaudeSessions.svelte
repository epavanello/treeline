<script lang="ts" module>
  /** Opened once, it stays open for every commit, worktree and diff after: a preference, not a selection. */
  const section = $state({ expanded: false });
</script>

<script lang="ts">
  import { ago, type ClaudeSession, type Worktree } from '@treeline/shared';
  import { BotMessageSquare, ChevronRight } from '@lucide/svelte';
  import { app } from '$lib/app.svelte';
  import { host } from '$lib/rpc';
  import { cn } from '$lib/utils';
  import { SUB } from './RefCard.svelte';

  /**
   * The details panel's legend line for the Claude Code sessions behind some branches or a worktree
   * (`app.sessionsOf`): collapsed to a count until opened, then the latest few (open ones first,
   * archived ones dimmed), each one click from being continued in the desktop app or a terminal.
   */
  let { branches, worktree }: { branches: (string | null | undefined)[]; worktree?: Worktree } =
    $props();

  const FEW = 3;
  let all = $state(false);

  const sessions = $derived.by(() => {
    const seen = new Map<string, { s: ClaudeSession; why: string }>();
    for (const b of branches.length ? branches : [null])
      for (const x of app.sessionsOf(b, worktree)) if (!seen.has(x.s.id)) seen.set(x.s.id, x);
    return [...seen.values()].sort(
      (a, b) => +a.s.archived - +b.s.archived || b.s.active - a.s.active
    );
  });
  const shown = $derived(all ? sessions : sessions.slice(0, FEW));
  const archivedCount = $derived(sessions.filter(({ s }) => s.archived).length);
  const latest = $derived(Math.max(...sessions.map(({ s }) => s.active)));

  const date = (t: number) =>
    new Date(t * 1000).toLocaleString(undefined, {
      day: 'numeric',
      month: 'short',
      year: new Date(t * 1000).getFullYear() === new Date().getFullYear() ? undefined : 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
</script>

{#snippet row(s: ClaudeSession, why: string)}
  <li>
    <button
      class={cn(
        'block w-full min-w-0 rounded-sm px-1 py-0.5 text-left hover:bg-accent',
        s.archived && 'opacity-60 hover:opacity-100'
      )}
      title={s.desktopId
        ? `Opens it in the Claude desktop app${s.archived ? ' (it stays archived)' : ''}`
        : `Runs claude --resume ${s.id} in a terminal, in ${s.cwd}`}
      onclick={() => host.resumeClaudeSession(s)}
    >
      <span class={cn('block truncate text-[12px]', !s.archived && 'font-semibold')}>
        {s.title}
      </span>
      <span class={SUB}>
        {why} · last message <span title={ago(s.active)}>{date(s.active)}</span>{s.prompts
          ? ` · ${s.prompts} message${s.prompts === 1 ? '' : 's'}`
          : ''} · {s.desktopId ? 'desktop app' : 'terminal'}
      </span>
    </button>
  </li>
{/snippet}

{#if sessions.length}
  <dt><BotMessageSquare class="size-3.5" /></dt>
  <dd>
    <button
      class="flex items-center gap-1 text-left"
      onclick={() => (section.expanded = !section.expanded)}
    >
      <span class="font-semibold">
        {sessions.length === 1 ? 'A Claude session' : `${sessions.length} Claude sessions`}
      </span>
      <ChevronRight
        class={cn(
          'size-3.5 text-muted-foreground transition-transform',
          section.expanded && 'rotate-90'
        )}
      />
    </button>
    <span class={SUB}>
      {archivedCount
        ? `${sessions.length - archivedCount} open, ${archivedCount} archived · `
        : ''}latest
      {date(latest)}{section.expanded ? ' · click one to continue it' : ''}
    </span>
    {#if section.expanded}
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
