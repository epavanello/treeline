<script lang="ts" module>
  import { cn, type WithElementRef } from '$lib/utils.js';
  import { LoaderCircle } from '@lucide/svelte';
  import { watch } from 'runed';
  import type { Component, Snippet } from 'svelte';
  import type { HTMLAnchorAttributes, HTMLButtonAttributes } from 'svelte/elements';
  import { type VariantProps, tv } from 'tailwind-variants';

  export const buttonVariants = tv({
    base: 'focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium outline-none transition-all focus-visible:ring-[3px] disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50',
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground shadow-xs hover:bg-primary/90',
        destructive:
          'bg-destructive shadow-xs hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40 dark:bg-destructive/60 text-white',
        outline:
          'bg-background shadow-xs hover:bg-accent hover:text-accent-foreground dark:bg-input/30 dark:border-input dark:hover:bg-input/50 border',
        secondary: 'bg-secondary text-secondary-foreground shadow-xs hover:bg-secondary/80',
        ghost: 'hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50',
        link: 'text-primary underline-offset-4 hover:underline'
      },
      size: {
        default: 'h-9 px-4 py-2 has-[>svg]:px-3',
        xs: 'h-6 gap-1 rounded px-2 text-xs has-[>svg]:px-1.5',
        sm: 'h-8 gap-1.5 rounded-md px-3 has-[>svg]:px-2.5',
        lg: 'h-10 rounded-md px-6 has-[>svg]:px-4',
        icon: 'size-9',
        'icon-xs': 'size-6',
        'icon-sm': 'size-8',
        'icon-lg': 'size-10'
      }
    },
    defaultVariants: {
      variant: 'default',
      size: 'default'
    }
  });

  const iconSizeMap = {
    default: 'size-4',
    xs: 'size-3',
    sm: 'size-4',
    lg: 'size-5',
    icon: 'size-4',
    'icon-xs': 'size-3',
    'icon-sm': 'size-4',
    'icon-lg': 'size-5'
  } as const;

  export type ButtonVariant = VariantProps<typeof buttonVariants>['variant'];
  export type ButtonSize = VariantProps<typeof buttonVariants>['size'];

  export type ButtonProps = WithElementRef<HTMLButtonAttributes> &
    WithElementRef<HTMLAnchorAttributes> & {
      variant?: ButtonVariant;
      size?: ButtonSize;
      icon?: Component;
      iconAtEnd?: boolean;
      loading?: boolean;
      /** Content shown inside the button while loading, replacing the children —
       * a plain string, or a snippet for rich content. */
      loadingContent?: string | Snippet;
      /** Append an elapsed `m:ss` counter, counting from the moment loading starts. */
      counterOnLoading?: boolean;
      /**
       * Rough expected duration (seconds) of the loading action. When set, a
       * background fill grows from 0 toward the end of the button, giving a
       * sense of progress. It's purely theoretical — time-aligned and capped
       * below 100% so it never claims completion before the action resolves.
       */
      expectedSeconds?: number;
      /**
       * When the loading work began (ms since the epoch), for work that outlives
       * this button: a render that keeps running while its menu is closed, or
       * that several buttons show at once. The counter and the progress fill
       * continue from there instead of restarting at 0 on every mount.
       * Read when loading turns on; defaults to that moment.
       */
      loadingSince?: number | null;
      href?: string;
    };

  function formatElapsed(total: number) {
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  }
</script>

<script lang="ts">
  let {
    class: className,
    variant = 'default',
    size = 'default',
    ref = $bindable(null),
    href = undefined,
    type = 'button',
    disabled: externalDisabled,
    children,
    onclick,
    icon,
    loading,
    loadingContent,
    counterOnLoading = false,
    expectedSeconds,
    loadingSince,
    iconAtEnd = false,
    ...restProps
  }: ButtonProps = $props();

  let isLoading = $derived(loading);
  const disabled = $derived(externalDisabled || isLoading);

  const handleClick: ButtonProps['onclick'] = (event) => {
    const result = onclick?.(event as Parameters<NonNullable<ButtonProps['onclick']>>[0]);
    if (result instanceof Promise) {
      isLoading = true;
      result.finally(() => {
        isLoading = false;
      });
    }
  };

  const hasProgress = $derived(!!expectedSeconds && expectedSeconds > 0);
  const trackTime = $derived(counterOnLoading || hasProgress);

  // Elapsed seconds since loading began (here, or at `loadingSince`). Drives
  // both the counter label and the theoretical progress fill.
  let elapsed = $state(0);
  watch([() => isLoading, () => trackTime], ([loadingNow, track]) => {
    if (!loadingNow || !track) {
      elapsed = 0;
      return;
    }
    // Read once, when loading begins: work that outlives the button already
    // knows its start then, and the count never jumps while it runs.
    const start = loadingSince ?? Date.now();
    const tick = () => (elapsed = Math.max(0, Math.floor((Date.now() - start) / 1000)));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  });

  const showLoadingLabel = $derived(isLoading && (!!loadingContent || counterOnLoading));
  const loadingText = $derived(typeof loadingContent === 'string' ? loadingContent : null);
  const loadingSnippet = $derived(typeof loadingContent === 'function' ? loadingContent : null);
  const loadingLabel = $derived(
    [loadingText, counterOnLoading ? formatElapsed(elapsed) : null].filter(Boolean).join(' ')
  );

  const showProgress = $derived(isLoading && hasProgress);
  // Time-aligned, capped below 100% so it never signals completion early.
  const progress = $derived(hasProgress ? Math.min(elapsed / expectedSeconds!, 0.97) : 0);
</script>

{#snippet spinnerAndIcon()}
  {#if isLoading}
    <LoaderCircle class={cn('animate-spin', iconSizeMap[size])} />
  {:else if icon}
    {@const Icon = icon}
    <Icon class={cn('pointer-events-none shrink-0', iconSizeMap[size])} />
  {/if}
{/snippet}

{#snippet label()}
  {#if showLoadingLabel}
    {#if loadingSnippet}{@render loadingSnippet()}{:else}{loadingLabel}{/if}
  {:else}
    {@render children?.()}
  {/if}
{/snippet}

<!-- Theoretical progress fill: sits behind the label (isolate + -z-10) and eases
     smoothly between the 1s ticks via the width transition. -->
{#snippet progressFill()}
  {#if showProgress}
    <span
      aria-hidden="true"
      class="pointer-events-none absolute inset-y-0 left-0 -z-10 bg-current opacity-[0.18] transition-[width] duration-1000 ease-linear"
      style="width: {progress * 100}%"
    ></span>
  {/if}
{/snippet}

{#snippet content()}
  {@render progressFill()}
  {#if iconAtEnd}
    {@render label()}
    {@render spinnerAndIcon()}
  {:else}
    {@render spinnerAndIcon()}
    {@render label()}
  {/if}
{/snippet}

{#if href}
  <a
    bind:this={ref}
    data-slot="button"
    class={cn(
      buttonVariants({ variant, size }),
      showProgress && 'relative isolate overflow-hidden',
      className
    )}
    href={disabled ? undefined : href}
    aria-disabled={disabled}
    role={disabled ? 'link' : undefined}
    tabindex={disabled ? -1 : undefined}
    onclick={handleClick}
    {...restProps}
  >
    {@render content()}
  </a>
{:else}
  <button
    bind:this={ref}
    data-slot="button"
    class={cn(
      buttonVariants({ variant, size }),
      showProgress && 'relative isolate overflow-hidden',
      className
    )}
    {type}
    {disabled}
    onclick={handleClick}
    {...restProps}
  >
    {@render content()}
  </button>
{/if}
