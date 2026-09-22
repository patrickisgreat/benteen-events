<script setup lang="ts">
// Public landing. Signed-in hosts go straight to their events.
definePageMeta({ layout: false })
const { appName, appTagline } = useRuntimeConfig().public
const user = useSupabaseUser()

watchEffect(() => {
  if (user.value) void navigateTo('/events')
})
</script>

<template>
  <div class="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary-500/10 via-default to-primary-500/5 px-4 py-10">
    <div class="w-full max-w-lg text-center space-y-6">
      <div class="space-y-2">
        <h1 class="text-4xl font-bold tracking-tight">
          {{ appName }}
        </h1>
        <p class="text-lg text-muted">
          {{ appTagline }}
        </p>
      </div>

      <p class="text-muted">
        Design an invitation, send it to everyone at once, and watch the RSVPs land.
        Your guests answer straight from their inbox — no account, no password, one click.
      </p>

      <UButton
        to="/login"
        label="Sign in to get started"
        size="lg"
        trailing-icon="i-lucide-arrow-right"
      />
    </div>
  </div>
</template>
