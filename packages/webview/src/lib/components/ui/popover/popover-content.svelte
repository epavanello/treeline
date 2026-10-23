<script lang="ts">
  import { Popover as PopoverPrimitive } from 'bits-ui';
  import PopoverPortal from './popover-portal.svelte';
  import { cn, type WithoutChildrenOrChild } from '$lib/utils.js';
  import type { ComponentProps } from 'svelte';

  let {
    ref = $bindable(null),
    class: className,
    sideOffset = 4,
    align = 'center',
    collisionPadding = 8,
    portalProps,
    ...restProps
  }: PopoverPrimitive.ContentProps & {
    portalProps?: WithoutChildrenOrChild<ComponentProps<typeof PopoverPortal>>;
  } = $props();
</script>

<PopoverPortal {...portalProps}>
  <PopoverPrimitive.Content
    bind:ref
    data-slot="popover-content"
    {sideOffset}
    {align}
    {collisionPadding}
    class={cn(
      // Never larger than the room the anchor leaves on screen: on a phone a
      // tall picker flipped above its button and lost its top edge. Content
      // with its own scroll area passes `flex flex-col overflow-hidden`.
      'z-50 max-h-(--bits-popover-content-available-height) w-72 max-w-[calc(100vw-2rem)] origin-(--bits-popover-content-transform-origin) overflow-y-auto rounded-md border bg-popover p-4 text-popover-foreground shadow-md outline-hidden data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-end-2 data-[side=right]:slide-in-from-start-2 data-[side=top]:slide-in-from-bottom-2 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95',
      className
    )}
    {...restProps}
  />
</PopoverPortal>
