<script setup lang="ts">
// OAuth callback. The Supabase module sets the session from the URL; we wait for
// the user to appear, then hand off to the events dashboard.
definePageMeta({ layout: false })
const user = useSupabaseUser()

watchEffect(() => {
  if (user.value) void navigateTo('/events')
})
</script>

<template>
  <div class="min-h-screen flex flex-col items-center justify-center gap-3">
    <UIcon
      name="i-lucide-loader-circle"
      class="size-8 animate-spin text-primary"
    />
    <p class="text-muted">
      Signing you in…
    </p>
  </div>
</template>
