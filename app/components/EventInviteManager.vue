<script setup lang="ts">
import { z } from 'zod'
import type { EventInvite } from '#shared/types/event-invite'
import type { AppEvent } from '#shared/types/event'
import { INVITE_ACCENTS, INVITE_THEMES, type InviteAccent, type InviteOptions, type InviteTheme } from '#shared/types/invite-options'

// Guest-list manager + e-vite designer + delivery tracker for one event. The
// host customizes the invitation (theme/accent/note/toggles) against a live
// preview, builds the list, sends the tokenized e-vites, and watches RSVPs,
// opens, and clicks land in real time.
const props = defineProps<{ eventId: string, event?: AppEvent | null }>()
const toast = useToast()
const { appName, appTagline } = useRuntimeConfig().public
const { invites, stats, addInvite, removeInvite, removeInvites, seedFromLastEvent, sendInvites, remindNonResponders } = useEventInvites(() => props.eventId)
const { save: saveInviteOptions } = useInviteOptions(() => props.eventId)
const { setEnabled: setRemindersEnabled } = useEventReminders(() => props.eventId)
const { roster } = useEventRsvps(() => props.eventId)

// Per-event auto-reminder toggle (defaults on). Re-sync if the event loads late.
const remindersOn = ref(props.event?.reminders_enabled ?? true)
watch(() => props.event?.id, () => {
  remindersOn.value = props.event?.reminders_enabled ?? true
})
async function onToggleReminders(value: boolean): Promise<void> {
  remindersOn.value = value
  try {
    await setRemindersEnabled(value)
    toast.add({ title: value ? 'Auto-reminders on for this event' : 'Auto-reminders off for this event', icon: 'i-lucide-check', color: 'success' })
  } catch {
    remindersOn.value = !value // revert on failure
    toast.add({ title: 'Could not update reminders', color: 'error' })
  }
}

const newEmail = ref('')
const newName = ref('')
const sending = ref(false)
const seeding = ref(false)
const deleting = ref(false)
const reminding = ref(false)
const emailSchema = z.string().email()

// People who were e-vited but haven't answered — the manual "remind now" audience.
const remindable = computed(() => invites.value.filter(i => !i.rsvp && i.sent_at).length)
const unsent = computed(() => invites.value.filter(i => !i.sent_at).length)

async function onRemind(): Promise<void> {
  reminding.value = true
  try {
    const { sent, failed, error } = await remindNonResponders()
    if (sent && failed) {
      toast.add({ title: `Reminded ${sent}, ${failed} failed`, description: error ?? undefined, icon: 'i-lucide-bell', color: 'warning' })
    } else if (sent) {
      toast.add({ title: `Reminded ${sent} ${sent === 1 ? 'person' : 'people'}`, icon: 'i-lucide-bell', color: 'success' })
    } else if (failed) {
      toast.add({ title: 'Could not send reminders', description: error ?? undefined, color: 'error' })
    } else {
      toast.add({ title: 'Everyone has already replied', color: 'neutral' })
    }
  } catch (error) {
    toast.add({ title: 'Could not send reminders', description: errorMessage(error), color: 'error' })
  } finally {
    reminding.value = false
  }
}

// A link the host can text or DM someone directly: it opens the same one-click
// RSVP page the emailed buttons do.
async function copyRsvpLink(invite: EventInvite): Promise<void> {
  const url = `${location.origin}/rsvp?token=${invite.token}`
  try {
    await navigator.clipboard.writeText(url)
    toast.add({ title: 'RSVP link copied', icon: 'i-lucide-check', color: 'success' })
  } catch {
    toast.add({ title: 'Copy failed — here it is', description: url, color: 'warning' })
  }
}

// --- E-vite designer -------------------------------------------------------
const THEME_LABELS: Record<InviteTheme, string> = { marquee: 'Marquee', neon: 'Neon', classic: 'Classic' }
const ACCENT_SWATCH: Record<InviteAccent, string> = {
  green: 'bg-green-600',
  red: 'bg-red-600',
  amber: 'bg-amber-600',
  violet: 'bg-violet-600',
  sky: 'bg-sky-600'
}
const options = ref<InviteOptions>(normalizeInviteOptions(props.event?.invite_options ?? null))
const savingOptions = ref(false)

// Re-sync the editor if the event changes underneath us (e.g. data loads late).
watch(() => props.event?.id, () => {
  options.value = normalizeInviteOptions(props.event?.invite_options ?? null)
})

// Named handlers rather than inline `@click="options.theme = t"`: an assignment
// expression evaluates to the assigned value, which the click handler's
// `=> void` prop type rejects under a strict vue-tsc.
function setTheme(theme: InviteTheme): void {
  options.value.theme = theme
}
function setAccent(accent: InviteAccent): void {
  options.value.accent = accent
}

// The live preview calls the exact same builder the server sends with — that is
// the whole reason it lives in shared/.
const previewHtml = computed(() => {
  const ev = props.event
  if (!ev) return ''
  return buildEventInviteEmail({
    eventTitle: ev.title,
    eventDate: ev.event_date ? formatEmailDate(ev.event_date) : null,
    eventTime: ev.start_time,
    location: ev.location,
    locationUrl: ev.location_url,
    coverImageUrl: ev.cover_image_url,
    description: ev.description,
    hostName: null,
    rsvpUrl: '#',
    brand: { name: appName, tagline: appTagline },
    options: options.value
  }).html
})

// Debounce the iframe srcdoc so typing in the note doesn't refetch the preview's
// <link> font on every keystroke. Seeded synchronously so the preview is there
// on first paint.
const debouncedPreview = ref(previewHtml.value)
let previewTimer: ReturnType<typeof setTimeout> | null = null
watch(previewHtml, (html) => {
  if (previewTimer) clearTimeout(previewTimer)
  previewTimer = setTimeout(() => {
    debouncedPreview.value = html
  }, 250)
})
onScopeDispose(() => {
  if (previewTimer) clearTimeout(previewTimer)
})

async function onSaveOptions(): Promise<void> {
  savingOptions.value = true
  try {
    await saveInviteOptions(options.value)
    toast.add({ title: 'E-vite design saved', icon: 'i-lucide-check', color: 'success' })
  } catch {
    toast.add({ title: 'Could not save the design', color: 'error' })
  } finally {
    savingOptions.value = false
  }
}

// --- Guest list ------------------------------------------------------------
// Multi-select for bulk delete, kept in sync as the list changes underneath
// (realtime, refresh) so a stale id can never be submitted.
const selected = ref<Set<string>>(new Set())
const selectedCount = computed(() => selected.value.size)
const allSelected = computed(() => invites.value.length > 0 && invites.value.every(i => selected.value.has(i.id)))

watch(invites, (list) => {
  const live = new Set(list.map(i => i.id))
  const next = new Set([...selected.value].filter(id => live.has(id)))
  if (next.size !== selected.value.size) selected.value = next
})

function toggleOne(id: string): void {
  const next = new Set(selected.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  selected.value = next
}
function toggleAll(): void {
  selected.value = allSelected.value ? new Set() : new Set(invites.value.map(i => i.id))
}
async function onDeleteSelected(): Promise<void> {
  const ids = [...selected.value]
  if (!ids.length) return
  deleting.value = true
  try {
    await removeInvites(ids)
    selected.value = new Set()
    toast.add({ title: `Removed ${ids.length} guest${ids.length === 1 ? '' : 's'}`, color: 'neutral' })
  } catch {
    toast.add({ title: 'Could not remove the selected guests', color: 'error' })
  } finally {
    deleting.value = false
  }
}

async function onAdd(): Promise<void> {
  const email = newEmail.value.trim()
  if (!emailSchema.safeParse(email).success) {
    toast.add({ title: 'Enter a valid email', color: 'warning' })
    return
  }
  try {
    await addInvite(email, newName.value.trim() || undefined)
    newEmail.value = ''
    newName.value = ''
  } catch {
    toast.add({ title: 'Could not add them', color: 'error' })
  }
}

async function onRemove(invite: EventInvite): Promise<void> {
  try {
    await removeInvite(invite.id)
  } catch {
    toast.add({ title: 'Could not remove them', color: 'error' })
  }
}

async function onSeed(): Promise<void> {
  seeding.value = true
  try {
    const n = await seedFromLastEvent()
    toast.add({ title: n ? `Added ${n} ${n === 1 ? 'person' : 'people'}` : 'Nothing new to pull in', color: 'neutral' })
  } catch {
    toast.add({ title: 'Could not pull in a guest list', color: 'error' })
  } finally {
    seeding.value = false
  }
}

async function onSend(): Promise<void> {
  sending.value = true
  try {
    const { sent, failed, error } = await sendInvites()
    if (sent && failed) {
      toast.add({ title: `Sent ${sent}, ${failed} failed`, description: error ?? undefined, icon: 'i-lucide-send', color: 'warning' })
    } else if (sent) {
      toast.add({ title: `Sent ${sent} invite${sent === 1 ? '' : 's'}`, icon: 'i-lucide-send', color: 'success' })
    } else if (failed) {
      // The send reached Resend but was rejected — show the reason rather than
      // reporting a success that didn't happen.
      toast.add({ title: `Couldn't send ${failed} invite${failed === 1 ? '' : 's'}`, description: error ?? undefined, color: 'error' })
    } else {
      toast.add({ title: 'Everyone has already been invited', color: 'neutral' })
    }
  } catch (error) {
    toast.add({ title: 'Could not send invites', description: errorMessage(error), color: 'error' })
  } finally {
    sending.value = false
  }
}

function statusBadge(invite: EventInvite): { label: string, color: 'success' | 'warning' | 'neutral' | 'info' } {
  if (invite.rsvp === 'going') return { label: 'Going', color: 'success' }
  if (invite.rsvp === 'maybe') return { label: 'Maybe', color: 'warning' }
  if (invite.rsvp === 'no') return { label: 'Can\'t make it', color: 'neutral' }
  // Nudged but still silent — so the host can see who's been reminded already.
  if (invite.reminded_at) return { label: 'Reminded', color: 'info' }
  if (invite.clicked_at) return { label: 'Clicked', color: 'info' }
  if (invite.opened_at) return { label: 'Opened', color: 'info' }
  if (invite.sent_at) return { label: 'Sent', color: 'neutral' }
  return { label: 'Not sent', color: 'neutral' }
}
</script>

<template>
  <div class="space-y-5">
    <!-- Tracker -->
    <div class="grid grid-cols-3 sm:grid-cols-6 gap-2 text-center">
      <UCard variant="subtle" :ui="{ body: 'p-3' }">
        <p class="text-xl font-bold">
          {{ stats.invited }}
        </p>
        <p class="text-xs text-muted">
          invited
        </p>
      </UCard>
      <UCard variant="subtle" :ui="{ body: 'p-3' }">
        <p class="text-xl font-bold">
          {{ stats.opened }}
        </p>
        <p class="text-xs text-muted">
          opened
        </p>
      </UCard>
      <UCard variant="subtle" :ui="{ body: 'p-3' }">
        <p class="text-xl font-bold text-success">
          {{ roster.going.length }}
        </p>
        <p class="text-xs text-muted">
          going
        </p>
      </UCard>
      <UCard variant="subtle" :ui="{ body: 'p-3' }">
        <p class="text-xl font-bold text-warning">
          {{ roster.maybe.length }}
        </p>
        <p class="text-xs text-muted">
          maybe
        </p>
      </UCard>
      <UCard variant="subtle" :ui="{ body: 'p-3' }">
        <p class="text-xl font-bold">
          {{ roster.no.length }}
        </p>
        <p class="text-xs text-muted">
          can't
        </p>
      </UCard>
      <UCard variant="subtle" :ui="{ body: 'p-3' }">
        <p class="text-xl font-bold text-muted">
          {{ roster.noReply.length }}
        </p>
        <p class="text-xs text-muted">
          no reply
        </p>
      </UCard>
    </div>

    <!-- Who's actually coming, by name -->
    <UCard variant="subtle" :ui="{ body: 'sm:p-4 p-3' }">
      <h3 class="text-sm font-semibold text-muted mb-3 flex items-center gap-1.5">
        <UIcon name="i-lucide-users" /> Who's RSVP'd · {{ roster.total }} total
      </h3>
      <RsvpRoster :roster="roster" show-no-reply />
    </UCard>

    <!-- E-vite designer: customize the invitation + live preview -->
    <UCollapsible v-if="event" :unmount-on-hide="false" class="rounded-lg ring ring-default">
      <UButton
        label="Design the e-vite"
        icon="i-lucide-palette"
        color="neutral"
        variant="ghost"
        trailing-icon="i-lucide-chevron-down"
        block
        class="justify-between"
      />
      <template #content>
        <div class="grid md:grid-cols-2 gap-5 p-4 border-t border-default">
          <!-- Controls -->
          <div class="space-y-4">
            <div>
              <p class="text-sm font-semibold mb-1.5">
                Theme
              </p>
              <div class="flex flex-wrap gap-2">
                <UButton
                  v-for="t in INVITE_THEMES"
                  :key="t"
                  :label="THEME_LABELS[t]"
                  size="sm"
                  :color="options.theme === t ? 'primary' : 'neutral'"
                  :variant="options.theme === t ? 'solid' : 'outline'"
                  :aria-pressed="options.theme === t"
                  @click="setTheme(t)"
                />
              </div>
            </div>

            <div>
              <p class="text-sm font-semibold mb-1.5">
                Accent
              </p>
              <div class="flex flex-wrap gap-2">
                <button
                  v-for="a in INVITE_ACCENTS"
                  :key="a"
                  type="button"
                  :aria-label="`Accent ${a}`"
                  :aria-pressed="options.accent === a"
                  class="size-7 rounded-full ring-2 ring-offset-2 ring-offset-default transition"
                  :class="[ACCENT_SWATCH[a], options.accent === a ? 'ring-primary' : 'ring-transparent']"
                  @click="setAccent(a)"
                />
              </div>
            </div>

            <div class="flex flex-wrap gap-4">
              <USwitch v-model="options.showCover" label="Show cover image" />
              <USwitch v-model="options.showDetails" label="Show date & details" />
            </div>

            <UFormField label="Personal message" hint="optional">
              <UTextarea
                v-model="options.message"
                :rows="3"
                placeholder="Come hungry — there'll be plenty."
                class="w-full"
              />
            </UFormField>

            <UButton label="Save design" icon="i-lucide-save" size="sm" :loading="savingOptions" @click="onSaveOptions" />
          </div>

          <!-- Live preview -->
          <div>
            <p class="text-sm font-semibold mb-1.5">
              Live preview
            </p>
            <iframe
              :srcdoc="debouncedPreview"
              title="E-vite preview"
              sandbox=""
              class="w-full h-[460px] rounded-lg ring ring-default bg-white"
            />
          </div>
        </div>
      </template>
    </UCollapsible>

    <!-- Add + actions -->
    <div class="flex flex-wrap items-end gap-2">
      <UFormField label="Add guest email" class="flex-1 min-w-48">
        <UInput v-model="newEmail" type="email" placeholder="friend@example.com" class="w-full" @keydown.enter="onAdd" />
      </UFormField>
      <UFormField label="Name" hint="optional" class="min-w-32">
        <UInput v-model="newName" placeholder="Jordan" class="w-full" @keydown.enter="onAdd" />
      </UFormField>
      <UButton label="Add" icon="i-lucide-plus" @click="onAdd" />
    </div>
    <div class="flex flex-wrap items-center gap-2">
      <UButton label="Pull in my people" icon="i-lucide-history" color="neutral" variant="outline" size="sm" :loading="seeding" @click="onSeed" />
      <UButton
        :label="unsent ? `Send ${unsent} invite${unsent === 1 ? '' : 's'}` : 'All invites sent'"
        icon="i-lucide-send"
        size="sm"
        :loading="sending"
        :disabled="!unsent"
        @click="onSend"
      />
      <UButton
        :label="remindable ? `Remind ${remindable} non-responder${remindable === 1 ? '' : 's'}` : 'No one to remind'"
        icon="i-lucide-bell"
        color="neutral"
        variant="outline"
        size="sm"
        :loading="reminding"
        :disabled="!remindable"
        @click="onRemind"
      />
    </div>

    <!-- Per-event auto-reminder toggle -->
    <USwitch
      :model-value="remindersOn"
      label="Auto-remind people who haven't RSVP'd"
      description="On the checkpoints set in your settings. Off skips this event."
      @update:model-value="onToggleReminders"
    />

    <!-- Bulk select toolbar -->
    <div v-if="invites.length" class="flex items-center gap-3 px-1">
      <UCheckbox
        :model-value="allSelected"
        aria-label="Select all guests"
        @update:model-value="toggleAll"
      />
      <span class="text-sm text-muted">
        {{ selectedCount ? `${selectedCount} selected` : 'Select all' }}
      </span>
      <UButton
        v-if="selectedCount"
        :label="`Delete ${selectedCount}`"
        icon="i-lucide-trash-2"
        color="error"
        variant="soft"
        size="xs"
        class="ml-auto"
        :loading="deleting"
        @click="onDeleteSelected"
      />
    </div>

    <!-- Guest list -->
    <ul v-if="invites.length" class="divide-y divide-default rounded-lg ring ring-default overflow-hidden">
      <li v-for="invite in invites" :key="invite.id" class="flex items-center gap-3 p-3">
        <UCheckbox
          :model-value="selected.has(invite.id)"
          :aria-label="`Select ${invite.display_name || invite.email}`"
          class="shrink-0"
          @update:model-value="toggleOne(invite.id)"
        />
        <div class="min-w-0 flex-1">
          <p class="font-medium truncate">
            {{ invite.display_name || invite.email }}
          </p>
          <p v-if="invite.display_name" class="text-xs text-muted truncate">
            {{ invite.email }}
          </p>
        </div>
        <UBadge :label="statusBadge(invite).label" :color="statusBadge(invite).color" variant="subtle" size="sm" class="shrink-0" />
        <UButton
          icon="i-lucide-link"
          color="neutral"
          variant="ghost"
          size="xs"
          aria-label="Copy RSVP link"
          class="shrink-0"
          @click="copyRsvpLink(invite)"
        />
        <UButton
          icon="i-lucide-x"
          color="neutral"
          variant="ghost"
          size="xs"
          aria-label="Remove guest"
          class="shrink-0"
          @click="onRemove(invite)"
        />
      </li>
    </ul>
    <p v-else class="text-sm text-muted">
      No guests yet — add emails above, or pull in your saved contacts.
    </p>
  </div>
</template>
