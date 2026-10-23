<script lang="ts">
  import * as Select from '$lib/components/ui/select';
  import type {
    SelectBaseRootPropsWithoutHTML,
    Select as SelectPrimitive,
    SelectSingleRootPropsWithoutHTML
  } from 'bits-ui';

  let {
    value = $bindable(),
    placeholder,
    options,
    root,
    trigger,
    content,
    group,
    item
  }: {
    value?: string;
    placeholder?: string;
    options: {
      value: string;
      label: string;
      disabled?: boolean;
    }[];
  } & {
    root?: Omit<
      SelectBaseRootPropsWithoutHTML & SelectSingleRootPropsWithoutHTML,
      'value' | 'type'
    >;
    trigger?: SelectPrimitive.TriggerProps;
    content?: SelectPrimitive.ContentProps;
    group?: SelectPrimitive.GroupProps;
    item?: SelectPrimitive.ItemProps;
  } = $props();

  const label = $derived(options.find((option) => option.value === value)?.label || placeholder);
</script>

<Select.Root {...root} bind:value type="single">
  <Select.Trigger {...trigger}>
    {label}
  </Select.Trigger>

  <Select.Content {...content}>
    <Select.Group {...group}>
      {#each options as option (option.value)}
        <Select.Item value={option.value} disabled={option.disabled} {...item}>
          {option.label}
        </Select.Item>
      {/each}
    </Select.Group>
  </Select.Content>
</Select.Root>
