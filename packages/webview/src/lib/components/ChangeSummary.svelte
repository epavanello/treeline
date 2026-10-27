<script lang="ts">
  import { host } from '$lib/rpc';
  import { Button } from '$lib/components/ui/button';
  import { SUB } from './RefCard.svelte';

  /**
   * What some changes are about, in 4 lines by Claude Code from their diff alone: those of commit
   * `rev`, or `repo`'s uncommitted ones (`rev` null). Written on request, shown again from then on.
   */
  let {
    repo,
    rev,
    version
  }: {
    repo: string;
    rev: string | null;
    /** Changes whenever the uncommitted changes may have (their file list): a new summary is due. */
    version?: unknown;
  } = $props();

  let summary = $state<string | null>(null);
  let error = $state<string | null>(null);
  /** The changes the summary or error belong to: a reply about previous ones is dropped. */
  let current = 0;

  $effect(() => {
    void version;
    const asked = ++current;
    summary = error = null;
    host.summarize(repo, rev, true).then(
      (s) => asked === current && (summary = s),
      () => {}
    );
  });

  async function write() {
    const asked = current;
    error = null;
    try {
      const s = await host.summarize(repo, rev, false);
      if (asked === current) summary = s;
    } catch (e) {
      if (asked === current) error = (e as Error).message;
    }
  }
</script>

{#if summary}
  <p class="whitespace-pre-wrap">{summary}</p>
  <span class={SUB}>summary by Claude, from the diff alone</span>
{:else}
  <Button
    class="h-6 px-2 text-xs font-normal"
    variant="outline"
    loadingContent="Summarizing…"
    expectedSeconds={8}
    hint={{
      title: 'Summarize with Claude',
      body: `Asks Claude Code (Haiku) what these changes do and what for, in 4 lines. It sees only the diff${rev ? '' : ', new files included'}: no project files, settings or tools.`,
      note: 'The summary stays: it shows again next time, until the changes do.'
    }}
    onclick={write}
  >
    Summarize
  </Button>
  {#if error}<p class="mt-1 text-xs text-destructive">{error}</p>{/if}
{/if}
