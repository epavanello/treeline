<script lang="ts">
  import type { Ref } from '@treeline/shared';
  import { app } from '$lib/app.svelte';

  /** A ref's short name (see `app.refLabel`): a remote, if shown, as a small muted prefix. */
  let { ref }: { ref: Ref } = $props();
  const l = $derived(app.refLabel(ref));
</script>

{#if l.remote}<span class="mr-0.5 text-[10px] text-muted-foreground">{l.remote}</span>{/if}{l.name}
