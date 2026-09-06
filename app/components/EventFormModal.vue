<script setup lang="ts">
import { z } from 'zod'
import type { FormSubmitEvent } from '@nuxt/ui'
import type { AppEvent, EventDraft } from '#shared/types/event'

// Create or edit an event. The same modal does both: pass `event` to edit.
const props = defineProps<{ event?: AppEvent | null }>()
const emit = defineEmits<{ saved: [id: string] }>()

const open = defineModel<boolean>('open', { default: false })
const toast = useToast()
const { createEvent, updateEvent } = useEvents()
const saving = ref(false)

const schema = z.object({
  title: z.string().trim().min(1, 'Give it a name').max(200),
  event_date: z.string().min(1, 'Pick a date'),
  start_time: z.string().optional(),
  location: z.string().trim().max(300).optional(),
  location_url: z.string().trim().url('Enter a full URL').or(z.literal('')).optional(),
  cover_image_url: z.string().trim().url('Enter a full URL').or(z.literal('')).optional(),
  description: z.string().max(10000).optional()
})
type Schema = z.output<typeof schema>

const state = reactive<Schema>({
  title: '',
  event_date: '',
  start_time: '',
  location: '',
  location_url: '',
  cover_image_url: '',
  description: ''
})

// Re-seed whenever the modal opens, so a cancelled edit never leaks into the
// next one.
watch(open, (isOpen) => {
  if (!isOpen) return
  const ev = props.event
  state.title = ev?.title ?? ''
  state.event_date = ev?.event_date ?? ''
  // `time` comes back as HH:MM:SS; the input wants HH:MM.
  state.start_time = ev?.start_time?.slice(0, 5) ?? ''
  state.location = ev?.location ?? ''
  state.location_url = ev?.location_url ?? ''
  state.cover_image_url = ev?.cover_image_url ?? ''
  state.description = ev?.description ?? ''
}, { immediate: true })

function closeModal(): void {
  open.value = false
}

/** Empty strings are "not set", which the nullable columns want as NULL. */
function nullable(value: string | undefined): string | null {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

async function onSubmit(event: FormSubmitEvent<Schema>): Promise<void> {
  saving.value = true
  const draft: EventDraft = {
    title: event.data.title.trim(),
    event_date: event.data.event_date,
    start_time: nullable(event.data.start_time),
    location: nullable(event.data.location),
    location_url: nullable(event.data.location_url),
    cover_image_url: nullable(event.data.cover_image_url),
    description: nullable(event.data.description)
  }
  try {
    if (props.event) {
      await updateEvent(props.event.id, draft)
      emit('saved', props.event.id)
      toast.add({ title: 'Event updated', icon: 'i-lucide-check', color: 'success' })
    } else {
      const created = await createEvent(draft)
      emit('saved', created.id)
      toast.add({ title: 'Event created', icon: 'i-lucide-check', color: 'success' })
    }
    open.value = false
  } catch (error) {
    toast.add({ title: 'Could not save the event', description: errorMessage(error), color: 'error' })
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <UModal v-model:open="open" :title="event ? 'Edit event' : 'New event'">
    <template #body>
      <UForm :schema="schema" :state="state" class="space-y-4" @submit="onSubmit">
        <UFormField label="What is it?" name="title" required>
          <UInput v-model="state.title" placeholder="Backyard cookout" class="w-full" />
        </UFormField>

        <div class="grid sm:grid-cols-2 gap-4">
          <UFormField label="Date" name="event_date" required>
            <UInput v-model="state.event_date" type="date" class="w-full" />
          </UFormField>
          <UFormField label="Start time" name="start_time" hint="optional">
            <UInput v-model="state.start_time" type="time" class="w-full" />
          </UFormField>
        </div>

        <UFormField label="Where" name="location" hint="optional">
          <UInput v-model="state.location" placeholder="123 Benteen Ave" class="w-full" />
        </UFormField>
        <UFormField label="Map link" name="location_url" hint="optional">
          <UInput v-model="state.location_url" type="url" placeholder="https://maps.app.goo.gl/…" class="w-full" />
        </UFormField>
        <UFormField label="Cover image" name="cover_image_url" hint="optional" description="Shown as the banner at the top of the e-vite.">
          <UInput v-model="state.cover_image_url" type="url" placeholder="https://…/photo.jpg" class="w-full" />
        </UFormField>

        <UFormField label="Details" name="description" hint="optional">
          <RichTextEditor v-model="state.description" />
        </UFormField>

        <div class="flex justify-end gap-2">
          <UButton label="Cancel" color="neutral" variant="ghost" @click="closeModal" />
          <UButton type="submit" :label="event ? 'Save changes' : 'Create event'" :loading="saving" />
        </div>
      </UForm>
    </template>
  </UModal>
</template>
