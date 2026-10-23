<script lang="ts">
  import { CloudDownload, RefreshCw, Search } from '@lucide/svelte';
  import { app } from '$lib/app.svelte';
  import { host } from '$lib/rpc';
  import { Button } from '$lib/components/ui/button';
  import { Checkbox } from '$lib/components/ui/checkbox';
  import * as Select from '$lib/components/ui/select';
  import MultiFilter from './MultiFilter.svelte';

  let {
    findInput = $bindable(),
    onFindEnter
  }: { findInput?: HTMLInputElement; onFindEnter: (back: boolean) => void } = $props();

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
        <Select.Trigger size="sm" class="h-6 max-w-56 px-2 text-xs">{repoName}</Select.Trigger>
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
      onchange={(v) => app.setBranches(v)}
    />
  </div>

  <div class="flex items-center gap-1.5">
    <span class="text-muted-foreground">Authors</span>
    <MultiFilter
      items={app.knownAuthors}
      selected={app.authors}
      noun="authors"
      onchange={(v) => app.setAuthors(v)}
    />
  </div>

  <label class="flex items-center gap-1.5">
    <Checkbox checked={app.showRemotes} onCheckedChange={(v) => app.setShowRemotes(!!v)} />
    Show Remote Branches
  </label>

  <div class="ml-auto flex items-center gap-1">
    <div class="relative">
      <Search
        class="pointer-events-none absolute top-1.5 left-1.5 size-3.5 text-muted-foreground"
      />
      <input
        bind:this={findInput}
        bind:value={app.find}
        placeholder="Find (⌘F)"
        class="h-6 w-48 rounded-sm border border-input bg-input-background pr-2 pl-6 text-xs outline-none focus:border-ring"
        onkeydown={(e) => {
          if (e.key === 'Enter') onFindEnter(e.shiftKey);
          if (e.key === 'Escape') app.find = '';
        }}
      />
    </div>
    {#if app.find}
      <span class="w-14 text-muted-foreground">{app.matches.size} found</span>
    {/if}
    <Button
      variant="ghost"
      size="icon-xs"
      title="Fetch from remote(s)"
      icon={CloudDownload}
      onclick={() => app.repo && host.run(app.repo, { type: 'fetch' })}
    />
    <Button
      variant="ghost"
      size="icon-xs"
      title="Refresh"
      icon={RefreshCw}
      onclick={() => app.refresh()}
    />
  </div>
</div>
