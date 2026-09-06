<script setup lang="ts">
import type { AppEvent } from '#shared/types/event'
import type { Database } from '~/types/database.types'

// One event's workspace: the details, the guest list + e-vite designer + RSVP
// tracker, the announcement composer, and the log of everything sent.
const route = useRoute()
const eventId = computed(() => route.params.id as string)
const supabase = useSupabaseClient<Database>()
const { appName } = useRuntimeConfig().public

const event = ref<AppEvent | null>(null)
const loadError = ref<string | null>(null)
const pending = ref(true)
const formOpen = ref(false)

async function load(): Promise<void> {
  pending.value = true
  // RLS scopes this to events you host, so a stranger's id simply returns
  // nothing rather than someone else's event.
  const { data, error } = await supabase.from('events').select('*').eq('id', eventId.value).maybeSingle()
  if (error) {
    loadError.value = errorMessage(error, 'Could not load that event')
  } else if (!data) {
    loadError.value = 'That event doesn\'t exist, or it isn\'t yours.'
  } else {
    event.value = data as AppEvent
    loadError.value = null
  }
  pending.value = false
}

watch(eventId, () => void load(), { immediate: true })

useSeoMeta({ title: () => `${event.value?.title ?? 'Event'} · ${appName}` })

const { entries } = useCommsLog(eventId)

const when = computed(() => {
  if (!event.value) return ''
  const date = formatDate(event.value.event_date, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
  return event.value.start_time ? `${date} at ${event.value.start_time.slice(0, 5)}` : date
})

const tabs = [
  { label: 'Guests & e-vite', value: 'guests', icon: 'i-lucide-mail' },
  { label: 'Announce', value: 'announce', icon: 'i-lucide-megaphone' },
  { label: 'History', value: 'history', icon: 'i-lucide-history' }
]
const tab = ref('guests')

function openEdit(): void {
  formOpen.value = true
}
</script>

<template>
  <div class="space-y-6">
    <UButton to="/events" label="All events" icon="i-lucide-arrow-left" color="neutral" variant="link" class="-ml-2" />

    <div v-if="pending" class="flex justify-center py-10">
      <UIcon name="i-lucide-loader-circle" class="size-6 animate-spin text-primary" />
    </div>

    <UAlert
      v-else-if="loadError"
      color="error"
      variant="subtle"
      icon="i-lucide-circle-alert"
      title="Not available"
      :description="loadError"
    />

    <template v-else-if="event">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div class="min-w-0">
          <h1 class="text-2xl font-bold">
            {{ event.title }}
          </h1>
          <p class="text-muted">
            {{ when }}
          </p>
          <p v-if="event.location" class="text-muted">
            <a v-if="event.location_url" :href="event.location_url" target="_blank" rel="noopener noreferrer" class="hover:text-primary">
              {{ event.location }}
            </a>
            <span v-else>{{ event.location }}</span>
          </p>
        </div>
        <UButton label="Edit" icon="i-lucide-pencil" color="neutral" variant="outline" size="sm" @click="openEdit" />
      </div>

      <!-- Host-authored rich text: sanitized, never rendered raw. -->
      <div v-if="event.description" class="prose prose-sm dark:prose-invert max-w-none" v-html="sanitizeHtml(event.description)" />

      <UTabs v-model="tab" :items="tabs" variant="link" :content="false" />

      <EventInviteManager v-if="tab === 'guests'" :event-id="event.id" :event="event" />
      <EventAnnounceComposer v-else-if="tab === 'announce'" :event-id="event.id" />
      <CommsLog v-else :entries="entries" />

      <EventFormModal v-model:open="formOpen" :event="event" @saved="load" />
    </template>
  </div>
</template>
