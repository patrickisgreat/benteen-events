<script setup lang="ts">
import type { AppEvent } from '#shared/types/event'

const { appName } = useRuntimeConfig().public
useSeoMeta({ title: `Events · ${appName}` })

const { upcoming, past, pending, error, deleteEvent } = useEvents()
const toast = useToast()

const formOpen = ref(false)
const editing = ref<AppEvent | null>(null)
const pendingDelete = ref<AppEvent | null>(null)
const deleting = ref(false)

function openNew(): void {
  editing.value = null
  formOpen.value = true
}
function openEdit(ev: AppEvent): void {
  editing.value = ev
  formOpen.value = true
}
function askDelete(ev: AppEvent): void {
  pendingDelete.value = ev
}
function cancelDelete(): void {
  pendingDelete.value = null
}

async function onSaved(id: string): Promise<void> {
  await navigateTo(`/events/${id}`)
}

async function onConfirmDelete(): Promise<void> {
  const ev = pendingDelete.value
  if (!ev) return
  deleting.value = true
  try {
    await deleteEvent(ev.id)
    toast.add({ title: 'Event deleted', color: 'neutral' })
    pendingDelete.value = null
  } catch (e) {
    toast.add({ title: 'Could not delete that event', description: errorMessage(e), color: 'error' })
  } finally {
    deleting.value = false
  }
}
</script>

<template>
  <div class="space-y-6">
    <div class="flex items-center justify-between gap-3">
      <h1 class="text-2xl font-bold">
        Your events
      </h1>
      <UButton
        label="New event"
        icon="i-lucide-plus"
        @click="openNew"
      />
    </div>

    <UAlert
      v-if="error"
      color="error"
      variant="subtle"
      icon="i-lucide-circle-alert"
      :description="error"
    />

    <div
      v-if="pending && !upcoming.length && !past.length"
      class="flex justify-center py-10"
    >
      <UIcon
        name="i-lucide-loader-circle"
        class="size-6 animate-spin text-primary"
      />
    </div>

    <template v-else>
      <section
        v-if="upcoming.length"
        class="space-y-3"
      >
        <h2 class="text-sm font-semibold text-muted uppercase tracking-wide">
          Coming up
        </h2>
        <ul class="grid gap-3 sm:grid-cols-2">
          <li
            v-for="ev in upcoming"
            :key="ev.id"
          >
            <EventSummaryCard
              :event="ev"
              @edit="openEdit(ev)"
              @delete="askDelete(ev)"
            />
          </li>
        </ul>
      </section>

      <section
        v-if="past.length"
        class="space-y-3"
      >
        <h2 class="text-sm font-semibold text-muted uppercase tracking-wide">
          Past
        </h2>
        <ul class="grid gap-3 sm:grid-cols-2">
          <li
            v-for="ev in past"
            :key="ev.id"
          >
            <EventSummaryCard
              :event="ev"
              @edit="openEdit(ev)"
              @delete="askDelete(ev)"
            />
          </li>
        </ul>
      </section>

      <UCard
        v-if="!upcoming.length && !past.length"
        variant="subtle"
        class="text-center"
      >
        <div class="py-8 space-y-3">
          <UIcon
            name="i-lucide-calendar-plus"
            class="size-8 text-muted"
          />
          <p class="font-medium">
            No events yet
          </p>
          <p class="text-sm text-muted">
            Create one, design its invitation, and send it to your people.
          </p>
          <UButton
            label="New event"
            icon="i-lucide-plus"
            @click="openNew"
          />
        </div>
      </UCard>
    </template>

    <EventFormModal
      v-model:open="formOpen"
      :event="editing"
      @saved="onSaved"
    />

    <UModal
      :open="pendingDelete !== null"
      title="Delete this event?"
      @update:open="cancelDelete"
    >
      <template #body>
        <p class="text-sm text-muted">
          “{{ pendingDelete?.title }}” and its guest list, RSVPs, and send history will be
          permanently removed. This can't be undone.
        </p>
        <div class="flex justify-end gap-2 mt-4">
          <UButton
            label="Cancel"
            color="neutral"
            variant="ghost"
            @click="cancelDelete"
          />
          <UButton
            label="Delete"
            color="error"
            :loading="deleting"
            @click="onConfirmDelete"
          />
        </div>
      </template>
    </UModal>
  </div>
</template>
