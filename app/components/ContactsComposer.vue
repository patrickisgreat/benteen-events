<script setup lang="ts">
import { parseRoster } from '#shared/utils/roster'
import { errorMessage } from '#shared/utils/errorMessage'

// Bulk-add to the host's address book. The paste is parsed live with the exact
// same function the server route uses, so the preview can never promise someone
// the insert will reject.
const { contacts, existingEmails, addContacts, removeContact } = useContacts()
const toast = useToast()

const text = ref('')
const note = ref('')
const silent = ref(false)
const submitting = ref(false)

const parsed = computed(() => parseRoster(text.value))
const alreadySaved = computed(() => parsed.value.entries.filter(e => existingEmails.value.has(e.email)))
const toAdd = computed(() => parsed.value.entries.filter(e => !existingEmails.value.has(e.email)))

function remove(email: string): void {
  // Drop the person from the box itself, so the textarea stays the source of truth.
  text.value = parsed.value.entries
    .filter(e => e.email !== email)
    .map(e => (e.name ? `${e.name} <${e.email}>` : e.email))
    .join('\n')
}

async function onDelete(id: string): Promise<void> {
  try {
    await removeContact(id)
  } catch (error) {
    toast.add({ title: 'Could not remove that contact', description: errorMessage(error), color: 'error' })
  }
}

async function onSubmit(): Promise<void> {
  submitting.value = true
  try {
    const result = await addContacts(text.value, { note: note.value.trim() || undefined, silent: silent.value })
    if (result.added && result.failed) {
      toast.add({
        title: `Saved ${result.added}, but ${result.failed} email${result.failed === 1 ? '' : 's'} failed`,
        description: result.error ?? undefined,
        icon: 'i-lucide-mail-warning',
        color: 'warning'
      })
    } else if (result.added) {
      toast.add({
        title: `Saved ${result.added} ${result.added === 1 ? 'contact' : 'contacts'}`,
        description: result.emailed
          ? `Welcome email sent to ${result.emailed === 1 ? 'them' : `all ${result.emailed}`}.`
          : silent.value
            ? 'No welcome email sent, as you asked.'
            : 'Email is not configured, so no welcome went out.',
        icon: 'i-lucide-mail-check',
        color: 'success'
      })
    } else {
      toast.add({ title: 'You already have everyone on that list', color: 'neutral' })
    }
    text.value = ''
    note.value = ''
  } catch (error) {
    toast.add({
      title: 'Could not save those contacts',
      description: errorMessage(error),
      icon: 'i-lucide-circle-alert',
      color: 'error'
    })
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="space-y-6">
    <UCard variant="subtle">
      <template #header>
        <div>
          <h2 class="font-semibold">
            Your people
          </h2>
          <p class="text-sm text-muted mt-1">
            Save the addresses you invite often. Any event's guest list can be filled
            from here in one click, so you never retype them.
          </p>
        </div>
      </template>

      <div class="space-y-4">
        <UFormField
          label="Emails"
          name="emails"
          hint="One per line, or comma-separated"
          description="Accepts plain addresses or “Sam Riley &lt;sam@example.com&gt;”."
        >
          <UTextarea
            v-model="text"
            :rows="5"
            class="w-full"
            placeholder="jordan@example.com&#10;Sam Riley <sam@example.com>&#10;pat@example.com, avery@example.com"
            data-testid="contacts-emails"
          />
        </UFormField>

        <div v-if="toAdd.length" class="flex flex-wrap gap-1.5">
          <UBadge
            v-for="entry in toAdd"
            :key="entry.email"
            color="primary"
            variant="subtle"
            class="gap-1"
          >
            {{ entry.name || entry.email }}
            <UButton
              icon="i-lucide-x"
              size="xs"
              color="primary"
              variant="link"
              :padded="false"
              :aria-label="`Remove ${entry.email}`"
              @click="remove(entry.email)"
            />
          </UBadge>
        </div>

        <UAlert
          v-if="alreadySaved.length"
          color="neutral"
          variant="subtle"
          icon="i-lucide-user-check"
          :title="`${alreadySaved.length} already saved`"
          :description="`${alreadySaved.map(e => e.email).join(', ')} — they'll be skipped, and won't be emailed again.`"
        />

        <UAlert
          v-if="parsed.invalid.length"
          color="warning"
          variant="subtle"
          icon="i-lucide-circle-alert"
          :title="`${parsed.invalid.length} couldn't be read as an email`"
          :description="`${parsed.invalid.join(', ')} — fix or remove ${parsed.invalid.length === 1 ? 'it' : 'them'} above.`"
        />

        <UFormField v-if="!silent" label="Note for the welcome email" hint="optional">
          <UTextarea
            v-model="note"
            :rows="2"
            class="w-full"
            placeholder="Adding you to my list so you hear about the next one."
          />
        </UFormField>

        <USwitch v-model="silent" label="Just save them — don't send a welcome email" />

        <div class="flex justify-end">
          <UButton
            :label="toAdd.length
              ? (silent ? `Save ${toAdd.length}` : `Save ${toAdd.length} & send welcome${toAdd.length === 1 ? '' : 's'}`)
              : 'Save contacts'"
            icon="i-lucide-user-plus"
            :disabled="!toAdd.length"
            :loading="submitting"
            data-testid="contacts-submit"
            @click="onSubmit"
          />
        </div>
      </div>
    </UCard>

    <UCard variant="subtle">
      <template #header>
        <h3 class="font-semibold">
          Address book
          <span class="text-muted font-normal">
            — {{ contacts.length }} {{ contacts.length === 1 ? 'person' : 'people' }}
          </span>
        </h3>
      </template>
      <p v-if="!contacts.length" class="text-sm text-muted">
        Nobody saved yet. Add your people above.
      </p>
      <ul v-else class="divide-y divide-default">
        <li v-for="person in contacts" :key="person.id" class="py-2 flex items-center justify-between gap-3">
          <div class="min-w-0">
            <p class="text-sm font-medium truncate">
              {{ person.display_name || person.email }}
            </p>
            <p v-if="person.display_name" class="text-xs text-muted truncate">
              {{ person.email }}
            </p>
          </div>
          <UButton
            icon="i-lucide-x"
            color="neutral"
            variant="ghost"
            size="xs"
            :aria-label="`Remove ${person.email}`"
            @click="onDelete(person.id)"
          />
        </li>
      </ul>
    </UCard>
  </div>
</template>
