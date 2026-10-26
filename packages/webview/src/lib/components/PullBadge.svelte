<script lang="ts" module>
  import type { PullRequest } from '@treeline/shared';
  import {
    GitMerge,
    GitPullRequest,
    GitPullRequestClosed,
    GitPullRequestDraft
  } from '@lucide/svelte';

  /** Each state's icon and color, as GitHub draws them (the theme's chart colors). */
  export const PULL_STATE = {
    open: { icon: GitPullRequest, class: 'text-ahead', label: 'Open' },
    draft: { icon: GitPullRequestDraft, class: 'text-muted-foreground', label: 'Draft' },
    merged: {
      icon: GitMerge,
      class: 'text-[var(--vscode-charts-purple,#a371f7)]',
      label: 'Merged'
    },
    closed: { icon: GitPullRequestClosed, class: 'text-destructive', label: 'Closed' }
  } satisfies Record<PullRequest['state'], unknown>;
</script>

<script lang="ts">
  import { MessageSquare } from '@lucide/svelte';

  /** A branch chip's pull request: its state, and its conversations still open. */
  let { pr }: { pr: PullRequest } = $props();
  const s = $derived(PULL_STATE[pr.state]);
</script>

<span
  class="inline-flex shrink-0 items-center gap-0.5 text-[11px] leading-none tabular-nums"
  title="#{pr.number} {pr.title} ({s.label.toLowerCase()}{pr.threads.unresolved
    ? `, ${pr.threads.unresolved} unresolved conversations`
    : ''})"
>
  <s.icon class="size-3 {s.class}" />
  {#if pr.threads.unresolved}
    <MessageSquare class="ml-0.5 size-3 translate-y-[0.5px] text-dirty" />{pr.threads.unresolved}
  {/if}
</span>
