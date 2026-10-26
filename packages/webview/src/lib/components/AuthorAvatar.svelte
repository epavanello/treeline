<script lang="ts">
  import * as Avatar from '$lib/components/ui/avatar';
  import { cn } from '$lib/utils';
  import { laneColor } from './GraphSvg.svelte';

  /**
   * A person's initials in a circle, in a color of their own (the same everywhere). `email` is for
   * the photo that may replace the initials one day.
   */
  let {
    name,
    email,
    class: className,
    style
  }: { name: string; email: string; class?: string; style?: string } = $props();

  const initials = $derived(
    name
      .replace(/\[bot\]$/, '')
      .split(/[\s._-]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0].toUpperCase())
      .join('')
  );
  const color = $derived(
    // From the name, like the owner counts: one person, one color, whichever email they used
    laneColor([...name.toLowerCase()].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7))
  );
</script>

<Avatar.Root class={cn('size-4 shrink-0', className)} {style}>
  <Avatar.Fallback
    class="text-[8px] font-semibold tracking-tighter text-background"
    style="background: {color}"
  >
    {initials}
  </Avatar.Fallback>
</Avatar.Root>
