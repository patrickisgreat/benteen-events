<script setup lang="ts">
import type { AppEvent } from '#shared/types/event'

// One event in the dashboard list, with its live RSVP headline.
const props = defineProps<{ event: AppEvent }>()
defineEmits<{ edit: [], delete: [] }>()

const { roster } = useEventRsvps(() => props.event.id)

const when = computed(() => {
  const date = formatDate(props.event.event_date, { weekday: 'short', month: 'short', day: 'numeric' })
  return props.event.start_time ? `${date} · ${props.event.start_time.slice(0, 5)}` : date
})
</script>

<template>
  <UCard
    variant="subtle"
    class="h-full"
  >
    <div class="flex items-start gap-3">
      <div class="min-w-0 flex-1">
        <NuxtLink
          :to="`/events/${event.id}`"
          class="font-semibold hover:text-primary truncate block"
        >
          {{ event.title }}
        </NuxtLink>
        <p class="text-sm text-muted">
          {{ when }}
        </p>
        <p
          v-if="event.location"
          class="text-sm text-muted truncate"
        >
          {{ event.location }}
        </p>
        <p class="text-sm mt-2">
          <span class="font-medium text-success">{{ roster.going.length }} going</span>
          <span class="text-muted"> · {{ roster.maybe.length }} maybe · {{ roster.noReply.length }} no reply</span>
        </p>
      </div>
      <div class="flex flex-col gap-1 shrink-0">
        <UButton
          icon="i-lucide-pencil"
          color="neutral"
          variant="ghost"
          size="xs"
          aria-label="Edit event"
          @click="$emit('edit')"
        />
        <UButton
          icon="i-lucide-trash-2"
          color="neutral"
          variant="ghost"
          size="xs"
          aria-label="Delete event"
          @click="$emit('delete')"
        />
      </div>
    </div>
  </UCard>
</template>
