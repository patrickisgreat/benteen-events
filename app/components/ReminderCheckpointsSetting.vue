<script setup lang="ts">
import { formatReminderDays, parseReminderDays } from '#shared/utils/reminders'

// How many days before an event the nightly cron nudges people who haven't
// answered. Blank turns automatic reminders off across all of this host's events.
const { reminderDays, setReminderDays } = useHostSettings()
const toast = useToast()

const draft = ref('')
const saving = ref(false)

// Seed the field once settings arrive, and re-seed if they change elsewhere.
watch(reminderDays, (days) => {
  draft.value = formatReminderDays(days)
}, { immediate: true })

const parsed = computed(() => parseReminderDays(draft.value))

async function onSave(): Promise<void> {
  saving.value = true
  try {
    await setReminderDays(parsed.value)
    toast.add({
      title: parsed.value.length
        ? `Reminders at ${formatReminderDays(parsed.value)} day${parsed.value.length === 1 ? '' : 's'} out`
        : 'Automatic reminders turned off',
      icon: 'i-lucide-check',
      color: 'success'
    })
  } catch {
    toast.add({ title: 'Could not save your checkpoints', color: 'error' })
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <UFormField
    label="Reminder checkpoints"
    description="Days before an event to nudge people who haven't RSVP'd. Leave blank to turn automatic reminders off."
  >
    <div class="flex flex-wrap items-center gap-2">
      <UInput v-model="draft" placeholder="7, 3, 1" class="w-40" @keydown.enter="onSave" />
      <UButton label="Save" size="sm" :loading="saving" @click="onSave" />
      <p class="text-sm text-muted">
        {{ parsed.length ? `Nudges at ${formatReminderDays(parsed)} days out.` : 'No automatic reminders.' }}
      </p>
    </div>
  </UFormField>
</template>
