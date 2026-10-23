<script lang="ts">
  import { Tooltip as TooltipPrimitive } from 'bits-ui';
  import Content from './tooltip-content.svelte';
  import type { Snippet } from 'svelte';
  import type { ButtonProps } from '../button';
  import Button from '../button/button.svelte';

  type Props = {
    content?: string | Snippet;
    delayDuration?: number;
    side?: 'top' | 'bottom' | 'left' | 'right';
    sideOffset?: number;
    contentClass?: string;
    children?: Snippet;
  } & ButtonProps;

  let {
    content,
    delayDuration = 400,
    side = 'top',
    sideOffset = 0,
    contentClass,
    children,
    ...buttonProps
  }: Props = $props();
</script>

<TooltipPrimitive.Provider>
  <TooltipPrimitive.Root {delayDuration}>
    <TooltipPrimitive.Trigger>
      {#snippet child({ props })}
        <Button {...props} {...buttonProps}>{@render children?.()}</Button>
      {/snippet}
    </TooltipPrimitive.Trigger>
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
