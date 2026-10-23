<script lang="ts">
  import { Tooltip as TooltipPrimitive } from 'bits-ui';
  import Content from './tooltip-content.svelte';
  import Trigger from './tooltip-trigger.svelte';
  import type { Snippet } from 'svelte';

  interface Props {
    content?: string | Snippet;
    children?: Snippet;
    delayDuration?: number;
    side?: 'top' | 'bottom' | 'left' | 'right';
    sideOffset?: number;
    contentClass?: string;
  }

  let {
    content,
    children,
    delayDuration = 400,
    side = 'top',
    sideOffset = 0,
    contentClass
  }: Props = $props();
</script>

<TooltipPrimitive.Provider>
  <TooltipPrimitive.Root {delayDuration}>
    <Trigger>
      {@render children?.()}
    </Trigger>
    {#if content}
      <Content {side} {sideOffset} class={contentClass}>
        {#if typeof content === 'string'}
          <p>{content}</p>
        {:else}
          {@render content()}
        {/if}
      </Content>
    {/if}
  </TooltipPrimitive.Root>
</TooltipPrimitive.Provider>
