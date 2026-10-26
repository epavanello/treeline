<script lang="ts">
  import { ago, type PullRequest } from '@treeline/shared';
  import { MessageSquare } from '@lucide/svelte';
  import { host } from '$lib/rpc';
  import { cn } from '$lib/utils';
  import AuthorAvatar from './AuthorAvatar.svelte';
  import { PULL_STATE } from './PullBadge.svelte';

  /** A pull request in a branch's card: title (opens it), state, review, conversations, checks. */
  let { pr, icon = true }: { pr: PullRequest; icon?: boolean } = $props();

  const s = $derived(PULL_STATE[pr.state]);
  const DECISION = {
    approved: { text: 'approved', class: 'text-ahead' },
    changes: { text: 'changes requested', class: 'text-destructive' },
    required: { text: 'review required', class: 'text-dirty' }
  };
  const VERDICT = {
    approved: { text: 'approved', class: 'text-ahead' },
    changes: { text: 'changes requested', class: 'text-destructive' },
    commented: { text: 'commented', class: 'text-muted-foreground' },
    requested: { text: 'waiting', class: 'text-dirty' },
    dismissed: { text: 'dismissed', class: 'text-muted-foreground line-through' }
  };
  const CHECKS = {
    passing: { text: 'checks passing', class: 'text-ahead' },
    failing: { text: 'checks failing', class: 'text-destructive' },
    pending: { text: 'checks running', class: 'text-dirty' }
  };
</script>

<div class="flex flex-col gap-0.5">
  <button
    class="flex items-start gap-1.5 text-left hover:underline"
    title="Open #{pr.number} on GitHub"
    onclick={() => host.openUrl(pr.url)}
  >
    {#if icon}<s.icon class="mt-px size-3.5 shrink-0 {s.class}" />{/if}
    <span><span class="text-muted-foreground">#{pr.number}</span> {pr.title}</span>
  </button>
  <div
    class={cn(
      'flex flex-wrap items-center gap-x-2 text-[11px] text-muted-foreground',
      icon && 'ml-5'
    )}
  >
    <span class={s.class}>{s.label}</span>
    {#if pr.state !== 'merged' && pr.state !== 'closed'}
      {#if pr.decision}
        <span class={DECISION[pr.decision].class}>{DECISION[pr.decision].text}</span>
      {/if}
      {#if pr.checks}<span class={CHECKS[pr.checks].class}>{CHECKS[pr.checks].text}</span>{/if}
    {/if}
    {#if pr.threads.unresolved || pr.threads.resolved}
      <span class="inline-flex items-center gap-1">
        <MessageSquare class="size-3" />
        {#if pr.threads.unresolved}
          <span class="text-dirty">{pr.threads.unresolved} unresolved</span>
          {#if pr.threads.resolved}· {pr.threads.resolved} resolved{/if}
        {:else}
          {pr.threads.resolved} resolved, none open
        {/if}
      </span>
    {/if}
    <span>by {pr.author} · {ago(pr.updatedAt)}</span>
  </div>
  {#if pr.reviewers.length}
    <div class={cn('flex flex-wrap gap-x-2.5 gap-y-0.5 text-[11px]', icon && 'ml-5')}>
      {#each pr.reviewers as r (r.login)}
        <span class="inline-flex items-center gap-1">
          <AuthorAvatar name={r.login} email={r.login} />
          {r.login}
          <span class={VERDICT[r.state].class}>{VERDICT[r.state].text}</span>
        </span>
      {/each}
    </div>
  {/if}
</div>
