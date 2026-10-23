<script lang="ts">
  import { CloudDownload, RefreshCw, Rows3, Search } from '@lucide/svelte';
  import * as Popover from '$lib/components/ui/popover';
  import { app } from '$lib/app.svelte';
  import { host } from '$lib/rpc';
  import { Button } from '$lib/components/ui/button';
  import { Checkbox } from '$lib/components/ui/checkbox';
  import * as Select from '$lib/components/ui/select';
  import MultiFilter from './MultiFilter.svelte';
  import Tip from './Tip.svelte';

  let {
    findInput = $bindable(),
    onFindEnter
  }: { findInput?: HTMLInputElement; onFindEnter: (back: boolean) => void } = $props();

  const ROWS = [
    ['worktrees', 'Worktrees', 'Every worktree of this repository and its status'],
    ['branches', 'Branches', 'Local branches, most recently committed first'],
    ['tags', 'Tags', 'Tags, most recent first']
  ] as const;

  const repoName = $derived(app.repos.find((r) => r.path === app.repo)?.name ?? 'No repository');
</script>

<div
  class="flex min-h-9 shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-b px-2 py-1.5 text-xs"
>
  <label class="flex items-center gap-1.5">
    <span class="text-muted-foreground">Repo</span>
    {#if app.repos.length > 1}
      <Select.Root
        type="single"
        value={app.repo ?? undefined}
        onValueChange={(v) => app.setRepo(v)}
      >
        <Tip
          hint="Which repository of this window the graph shows. The one containing the active editor comes first."
        >
          {#snippet children(trigger)}
            <Select.Trigger {...trigger} size="sm" class="h-6 max-w-56 px-2 text-xs">
              {repoName}
            </Select.Trigger>
          {/snippet}
        </Tip>
        <Select.Content>
          {#each app.repos as r (r.path)}
            <Select.Item value={r.path} label={r.name}>{r.name}</Select.Item>
          {/each}
        </Select.Content>
      </Select.Root>
    {:else}
      <span class="font-semibold">{repoName}</span>
    {/if}
  </label>

  <div class="flex items-center gap-1.5">
    <span class="text-muted-foreground">Branches</span>
    <MultiFilter
      items={app.data?.branches ?? []}
      selected={app.branches}
      noun="branches"
      hint={{
        title: 'Branches',
        body: 'Show only the history of the branches you pick (any number). Show All includes every branch, tag and the current HEAD.'
      }}
      onchange={(v) => app.setBranches(v)}
    />
  </div>

  <div class="flex items-center gap-1.5">
    <span class="text-muted-foreground">Authors</span>
    <MultiFilter
      items={app.knownAuthors}
      selected={app.authors}
      noun="authors"
      hint={{
        title: 'Authors',
        body: 'Show only commits by the people you pick; picking several shows commits by any of them. The list grows as more history loads.',
        command: 'git log --author=…'
      }}
      onchange={(v) => app.setAuthors(v)}
    />
  </div>

  <Tip
    hint="Include remote-tracking branches (origin/…) in the graph and in the branch lists. Turn it off to focus on your local branches."
  >
    {#snippet children(trigger)}
      <label {...trigger} class="flex items-center gap-1.5">
        <Checkbox checked={app.showRemotes} onCheckedChange={(v) => app.setShowRemotes(!!v)} />
        Show Remote Branches
      </label>
    {/snippet}
  </Tip>

  <div class="ml-auto flex items-center gap-1">
    <div class="relative">
      <Search
        class="pointer-events-none absolute top-1.5 left-1.5 size-3.5 text-muted-foreground"
      />
      <Tip
        hint={{
          title: 'Find',
          body: 'Highlights the loaded commits whose subject, hash, author or branch/tag matches, and dims the rest.',
          command: '⌘/Ctrl+F: focus · Enter: next match · Shift+Enter: previous · Esc: clear'
        }}
      >
        {#snippet children(trigger)}
          <input
            {...trigger}
            type="text"
            bind:this={findInput}
            bind:value={app.find}
            placeholder="Find (⌘F)"
            class="h-6 w-48 rounded-sm border border-input bg-input-background pr-2 pl-6 text-xs outline-none focus:border-ring"
            onkeydown={(e) => {
              if (e.key === 'Enter') onFindEnter(e.shiftKey);
              if (e.key === 'Escape') app.find = '';
            }}
          />
        {/snippet}
      </Tip>
    </div>
    {#if app.find}
      <span class="w-14 text-muted-foreground">{app.matches.size} found</span>
    {/if}
    <Popover.Root>
      <Popover.Trigger>
        {#snippet child({ props })}
          <Button
            {...props}
            variant="ghost"
            size="icon-xs"
            icon={Rows3}
            hint="Choose the rows under the toolbar: worktrees, branches, tags. Remembered across windows."
          />
        {/snippet}
      </Popover.Trigger>
      <Popover.Content class="w-60 p-1.5 text-xs" align="end">
        <p class="px-1.5 py-1 font-semibold">Show rows</p>
        {#each ROWS as [key, label, description] (key)}
          <label class="flex items-start gap-2 rounded-sm px-1.5 py-1 hover:bg-accent">
            <Checkbox
              class="mt-px"
              checked={app.view[key]}
              onCheckedChange={(v) => app.setView({ [key]: !!v })}
            />
            <span>
              <span class="block">{label}</span>
              <span class="text-muted-foreground">{description}</span>
            </span>
          </label>
        {/each}
      </Popover.Content>
    </Popover.Root>
    <Button
      variant="ghost"
      size="icon-xs"
      hint={{
        title: 'Fetch',
        body: "Downloads new commits, branches and tags from every remote and forgets remote branches deleted there. Your branches and files don't change.",
        command: 'git fetch --all --prune'
      }}
      icon={CloudDownload}
      onclick={() => app.repo && host.run(app.repo, { type: 'fetch' })}
    />
    <Button
      variant="ghost"
      size="icon-xs"
      hint={app.running.length
        ? 'A git operation is running: the graph reloads when it finishes.'
        : 'Reload the graph. It also reloads by itself whenever the repository changes.'}
      icon={RefreshCw}
      loading={app.running.length > 0}
      onclick={() => app.refresh()}
    />
  </div>
</div>
