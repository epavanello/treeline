<script lang="ts">
  import type { BranchAuthor } from '@treeline/shared';
  import AuthorAvatar from './AuthorAvatar.svelte';

  /** A branch's authors, most commits first, overlapping: the owner on top. */
  let { authors, max = 3 }: { authors: BranchAuthor[]; max?: number } = $props();
</script>

<span class="inline-flex shrink-0 items-center">
  {#each authors.slice(0, max) as a, i (a.name)}
    <AuthorAvatar
      name={a.name}
      email={a.email}
      class="ring-1 ring-background {i ? '-ml-1' : ''}"
      style="z-index: {max - i}"
    />
  {/each}
  {#if authors.length > max}
    <span class="ml-0.5 text-[10px] text-muted-foreground">+{authors.length - max}</span>
  {/if}
</span>
