<script setup lang="ts">
import { z } from 'zod'
import type { FormSubmitEvent } from '@nuxt/ui'
import type { CommsTemplate } from '#shared/types/comms-template'

// Event blast composer → POST /api/events/announce, which re-checks that you
// host the event. The message is rich text (tiptap); the server sanitizes it to
// a strict tag allowlist before it goes into the email. Templates let a
// recurring blast (a "what to bring" nudge, say) be applied, tweaked, and
// re-sent for the next event.
const props = defineProps<{ eventId: string | undefined }>()
const toast = useToast()
const { run } = useToastAction()
const sending = ref(false)

const { templates, saveTemplate, removeTemplate } = useCommsTemplates()
const savingTemplate = ref(false)
const templateName = ref('')

const scopeOptions = [
  { label: 'Everyone invited', value: 'invited' as const },
  { label: 'Only people going', value: 'going' as const },
  { label: 'Only people who haven\'t replied', value: 'noreply' as const }
]
type Scope = (typeof scopeOptions)[number]['value']

const schema = z.object({
  subject: z.string().trim().max(200).optional(),
  message: z.string().max(10000).refine(m => htmlToText(m).length > 0, 'Write a message'),
  scope: z.enum(['invited', 'going', 'noreply'])
})
const state = reactive<{ subject: string, message: string, scope: Scope }>({
  subject: '',
  message: '',
  scope: 'invited'
})

const messageHasText = computed(() => htmlToText(state.message).length > 0)

// The subject always mirrors the chosen template — including clearing it for a
// subject-less template — so the form never shows a stale draft as "applied".
function applyTemplate(template: CommsTemplate): void {
  state.message = template.body
  state.subject = template.subject ?? ''
}

function openTemplateForm(): void {
  savingTemplate.value = true
}
function closeTemplateForm(): void {
  savingTemplate.value = false
}

async function onSaveTemplate(): Promise<void> {
  const name = templateName.value.trim()
  if (!name || !messageHasText.value) return
  if (await run(() => saveTemplate(name, state.subject || null, state.message), 'Could not save the template')) {
    toast.add({ title: 'Template saved', icon: 'i-lucide-check', color: 'success' })
    savingTemplate.value = false
    templateName.value = ''
  }
}

async function onRemoveTemplate(template: CommsTemplate): Promise<void> {
  if (await run(() => removeTemplate(template), 'Could not delete the template')) {
    toast.add({ title: 'Template deleted', icon: 'i-lucide-check', color: 'success' })
  }
}

function messageOf(error: unknown): string | undefined {
  if (error && typeof error === 'object' && 'statusMessage' in error) {
    const m = (error as { statusMessage?: unknown }).statusMessage
    if (typeof m === 'string') return m
  }
  return error instanceof Error ? error.message : undefined
}

async function onSubmit(event: FormSubmitEvent<{ subject?: string, message: string, scope: Scope }>): Promise<void> {
  if (!props.eventId) {
    toast.add({ title: 'Pick an event first', color: 'warning' })
    return
  }
  sending.value = true
  try {
    const res = await $fetch<{ ok: boolean, count: number, failed?: number, error?: string | null }>('/api/events/announce', {
      method: 'POST',
      body: { eventId: props.eventId, subject: event.data.subject || undefined, message: event.data.message, scope: event.data.scope }
    })
    const failed = res.failed ?? 0
    if (res.count && failed) {
      // Partial delivery — some groups went out, some didn't (don't pretend full success).
      toast.add({ title: `Sent to ${res.count}, ${failed} failed`, description: res.error ?? undefined, icon: 'i-lucide-send', color: 'warning' })
    } else if (res.count) {
      toast.add({ title: `Sent to ${res.count} ${res.count === 1 ? 'person' : 'people'}`, icon: 'i-lucide-send', color: 'success' })
    } else if (failed) {
      toast.add({ title: 'Could not send the blast', description: res.error ?? undefined, color: 'error' })
    } else {
      toast.add({ title: 'No recipients matched', color: 'warning' })
    }
    // Keep the draft if nothing went out, so the host can retry.
    if (res.count) {
      state.subject = ''
      state.message = ''
    }
  } catch (error) {
    toast.add({ title: 'Could not send the blast', description: messageOf(error), color: 'error' })
  } finally {
    sending.value = false
  }
}
</script>

<template>
  <div class="space-y-3">
    <div v-if="templates.length" class="space-y-1.5">
      <p class="text-xs font-medium text-muted">
        Templates
      </p>
      <div class="flex flex-wrap gap-2">
        <UButtonGroup v-for="tpl in templates" :key="tpl.id" size="xs">
          <UButton :label="tpl.name" icon="i-lucide-file-text" color="neutral" variant="outline" @click="applyTemplate(tpl)" />
          <UButton
            icon="i-lucide-x"
            color="neutral"
            variant="outline"
            :aria-label="`Delete template ${tpl.name}`"
            @click="onRemoveTemplate(tpl)"
          />
        </UButtonGroup>
      </div>
    </div>

    <UForm :schema="schema" :state="state" class="space-y-3" @submit="onSubmit">
      <UFormField label="Audience" name="scope">
        <USelectMenu
          v-model="state.scope"
          :items="scopeOptions"
          value-key="value"
          :search-input="false"
          class="w-full sm:max-w-xs"
        />
      </UFormField>
      <UFormField label="Subject" name="subject" hint="Optional">
        <UInput v-model="state.subject" placeholder="A quick update about Saturday" class="w-full" />
      </UFormField>
      <UFormField label="Message" name="message" required>
        <RichTextEditor v-model="state.message" />
      </UFormField>

      <div v-if="savingTemplate" class="flex gap-2">
        <UInput v-model="templateName" placeholder="Template name" class="flex-1" @keydown.enter.prevent="onSaveTemplate" />
        <UButton label="Save" :disabled="!templateName.trim()" @click="onSaveTemplate" />
        <UButton label="Cancel" color="neutral" variant="ghost" @click="closeTemplateForm" />
      </div>

      <div class="flex flex-wrap justify-between gap-2">
        <UButton
          v-if="!savingTemplate"
          label="Save as template"
          icon="i-lucide-bookmark-plus"
          color="neutral"
          variant="outline"
          :disabled="!messageHasText"
          @click="openTemplateForm"
        />
        <UButton type="submit" label="Send blast" icon="i-lucide-megaphone" :loading="sending" :disabled="!eventId" class="ml-auto" />
      </div>
    </UForm>
  </div>
</template>
