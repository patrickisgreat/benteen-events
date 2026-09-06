<script setup lang="ts">
import { MAX_PLUS_ONES } from '#shared/types/rsvp'

// A compact "− N +" stepper for the number of additional guests an attendee is
// bringing (their "+1"s). Clamps to [0, max]; emits on every change.
const model = defineModel<number>({ default: 0 })
const props = withDefaults(defineProps<{ max?: number, disabled?: boolean }>(), { max: MAX_PLUS_ONES, disabled: false })

const atMin = computed(() => props.disabled || model.value <= 0)
const atMax = computed(() => props.disabled || model.value >= props.max)

function step(delta: number): void {
  if (props.disabled) return
  model.value = Math.min(props.max, Math.max(0, model.value + delta))
}
</script>

<template>
  <div class="inline-flex items-center gap-2">
    <UButton
      icon="i-lucide-minus"
      size="xs"
      color="neutral"
      variant="outline"
      :disabled="atMin"
      aria-label="One fewer guest"
      @click="step(-1)"
    />
    <span class="min-w-16 text-center text-sm tabular-nums" aria-live="polite">
      {{ model === 0 ? 'just me' : `+${model} guest${model === 1 ? '' : 's'}` }}
    </span>
    <UButton
      icon="i-lucide-plus"
      size="xs"
      color="neutral"
      variant="outline"
      :disabled="atMax"
      aria-label="One more guest"
      @click="step(1)"
    />
  </div>
</template>
