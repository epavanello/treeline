<script lang="ts">
  import { since } from '@treeline/shared';
  import { FolderGit2, GitBranch, LoaderCircle, Plus, Tag } from '@lucide/svelte';
  import { app } from '$lib/app.svelte';
  import { menuItems, refCommit } from '$lib/menus';
  import { host } from '$lib/rpc';
  import { Button } from '$lib/components/ui/button';
  import { cn } from '$lib/utils';
  import ActionMenu from './ActionMenu.svelte';
  import NavStrip from './NavStrip.svelte';
  import RefCard from './RefCard.svelte';
  import WorktreeState from './WorktreeState.svelte';
  import Tip from './Tip.svelte';

  /** The local branches or the tags, most recent first, as a row of chips. */
  let { kind }: { kind: 'heads' | 'tags' } = $props();

  // Repositories with hundreds of deploy tags: the most recent ones are what matters here
  const LIMIT = 100;
  const all = $derived(app.data?.[kind] ?? []);
  const items = $derived(all.slice(0, LIMIT));
  const shown = $derived(kind === 'heads' ? app.view.branches : app.view.tags);
</script>

{#if shown && app.data}
  <ActionMenu>
    {#snippet children(open)}
      <NavStrip
        label={kind === 'heads' ? 'Branches' : 'Tags'}
        count={all.length}
        empty={kind === 'heads' ? 'No branches yet' : 'No tags yet'}
      >
        {#each items as r (r.ref.name)}
          {@const current = kind === 'heads' && r.ref.name === app.data?.currentBranch}
          {@const Icon = r.ref.worktree ? FolderGit2 : kind === 'heads' ? GitBranch : Tag}
          {#snippet details()}
            <RefCard
              {r}
              footer="Click: show it in the graph · Right-click: {kind === 'heads'
                ? 'pull, push and more'
                : 'tag actions'}"
            />
          {/snippet}
          <Tip content={details}>
            {#snippet children(trigger)}
              <button
                {...trigger}
                class={cn(
                  'flex h-6 max-w-64 shrink-0 items-center gap-1.5 rounded-sm border px-2 hover:bg-accent data-menu-open:bg-accent',
                  current && 'border-ring font-semibold'
                )}
                onclick={() => app.reveal(r.hash)}
                oncontextmenu={(e) =>
                  open(e, menuItems({ kind: 'ref', ref: r.ref, commit: refCommit(r) }))}
              >
                {#if app.isRunning(r.ref.name, r.ref.worktree)}
                  <LoaderCircle class="size-3.5 shrink-0 animate-spin" />
                {:else}
                  <Icon class="size-3.5 shrink-0" />
                {/if}
                <span class="truncate">{r.ref.name}</span>
                {#if kind === 'heads'}
                  {@const up = r.ref.upstream}
                  <WorktreeState
                    changes={false}
                    status={{
                      changes: 0,
                      ahead: up?.ahead ?? 0,
                      behind: up?.behind ?? 0,
                      upstream: up && !up.gone ? up.name : null
                    }}
                  />
                {/if}
                <span class="shrink-0 text-muted-foreground tabular-nums">{since(r.date)}</span>
              </button>
            {/snippet}
          </Tip>
        {/each}
        {#if all.length > LIMIT}
          <span class="shrink-0 px-1 text-muted-foreground">+{all.length - LIMIT} older</span>
        {/if}
        {#snippet action()}
          {#if kind === 'heads' && app.data?.head}
            <Button
              variant="ghost"
              size="icon-xs"
              icon={Plus}
              hint={{
                title: 'New branch',
                body: 'Asks for a name, creates the branch at the current commit and switches to it.',
                command: 'git checkout -b <name>'
              }}
              onclick={() =>
                app.repo && host.run(app.repo, { type: 'createBranch', hash: app.data!.head! })}
            />
          {:else if kind === 'tags' && app.data?.head}
            <Button
              variant="ghost"
              size="icon-xs"
              icon={Plus}
              hint={{
                title: 'New tag',
                body: 'Tags the current commit. Suggests the next version after your latest one (patch, minor, major), or any name you type; then offers to push it.',
                command: 'git tag <name>'
              }}
              onclick={() =>
                app.repo && host.run(app.repo, { type: 'addTag', hash: app.data!.head! })}
            />
          {/if}
        {/snippet}
      </NavStrip>
    {/snippet}
  </ActionMenu>
{/if}
