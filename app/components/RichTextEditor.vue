<script setup lang="ts">
import { EditorContent, useEditor } from '@tiptap/vue-3'
import StarterKit from '@tiptap/starter-kit'

const model = defineModel<string>({ default: '' })

const editor = useEditor({
  content: model.value,
  extensions: [StarterKit],
  editorProps: {
    attributes: { class: 'focus:outline-none min-h-32 px-3 py-2' }
  },
  onUpdate: ({ editor }) => {
    model.value = editor.getHTML()
  }
})

// Re-sync when the bound value changes externally (e.g. opening the edit modal).
watch(model, (value) => {
  if (editor.value && value !== editor.value.getHTML()) {
    editor.value.commands.setContent(value || '', { emitUpdate: false })
  }
})

onBeforeUnmount(() => editor.value?.destroy())

interface ToolButton {
  icon: string
  label: string
  isActive: () => boolean
  run: () => void
}

const tools = computed<ToolButton[]>(() => {
  const e = editor.value
  if (!e) return []
  return [
    { icon: 'i-lucide-bold', label: 'Bold', isActive: () => e.isActive('bold'), run: () => e.chain().focus().toggleBold().run() },
    { icon: 'i-lucide-italic', label: 'Italic', isActive: () => e.isActive('italic'), run: () => e.chain().focus().toggleItalic().run() },
    { icon: 'i-lucide-strikethrough', label: 'Strikethrough', isActive: () => e.isActive('strike'), run: () => e.chain().focus().toggleStrike().run() },
    { icon: 'i-lucide-heading-2', label: 'Heading', isActive: () => e.isActive('heading', { level: 2 }), run: () => e.chain().focus().toggleHeading({ level: 2 }).run() },
    { icon: 'i-lucide-list', label: 'Bullet list', isActive: () => e.isActive('bulletList'), run: () => e.chain().focus().toggleBulletList().run() },
    { icon: 'i-lucide-list-ordered', label: 'Numbered list', isActive: () => e.isActive('orderedList'), run: () => e.chain().focus().toggleOrderedList().run() },
    { icon: 'i-lucide-quote', label: 'Quote', isActive: () => e.isActive('blockquote'), run: () => e.chain().focus().toggleBlockquote().run() }
  ]
})
</script>

<template>
  <div class="rounded-lg ring ring-default focus-within:ring-2 focus-within:ring-primary overflow-hidden">
    <div class="flex flex-wrap gap-1 border-b border-default p-1.5 bg-elevated/40">
      <UButton
        v-for="tool in tools"
        :key="tool.label"
        :icon="tool.icon"
        :aria-label="tool.label"
        size="sm"
        :color="tool.isActive() ? 'primary' : 'neutral'"
        :variant="tool.isActive() ? 'soft' : 'ghost'"
        @click="tool.run()"
      />
    </div>
    <div class="editor-content text-sm">
      <EditorContent :editor="editor" />
    </div>
  </div>
</template>

<style scoped>
.editor-content :deep(.ProseMirror) {
  min-height: 8rem;
}
.editor-content :deep(h2) {
  font-size: 1.25rem;
  font-weight: 600;
  margin: 0.5rem 0;
}
.editor-content :deep(p) {
  margin: 0.5rem 0;
}
.editor-content :deep(ul) {
  list-style: disc;
  padding-left: 1.25rem;
  margin: 0.5rem 0;
}
.editor-content :deep(ol) {
  list-style: decimal;
  padding-left: 1.25rem;
  margin: 0.5rem 0;
}
.editor-content :deep(blockquote) {
  border-left: 3px solid var(--ui-border-accented);
  padding-left: 0.75rem;
  color: var(--ui-text-muted);
  margin: 0.5rem 0;
}
</style>
