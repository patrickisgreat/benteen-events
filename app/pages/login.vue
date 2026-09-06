<script setup lang="ts">
definePageMeta({ layout: false })
const { appName } = useRuntimeConfig().public
useSeoMeta({ title: `Sign in · ${appName}` })

const { signInWithGoogle } = useAuth()
const user = useSupabaseUser()
const toast = useToast()
const signingIn = ref(false)

watchEffect(() => {
  if (user.value) void navigateTo('/events')
})

async function onGoogle(): Promise<void> {
  signingIn.value = true
  try {
    await signInWithGoogle()
    // The browser navigates away to Google here; nothing follows.
  } catch (error) {
    signingIn.value = false
    toast.add({ title: 'Could not start sign-in', description: errorMessage(error), color: 'error' })
  }
}
</script>

<template>
  <div class="min-h-screen flex items-center justify-center px-4 py-10">
    <UCard class="w-full max-w-sm">
      <div class="text-center space-y-5 py-2">
        <div>
          <h1 class="text-2xl font-bold">
            {{ appName }}
          </h1>
          <p class="text-muted text-sm mt-1">
            Sign in to host an event.
          </p>
        </div>
        <UButton
          label="Continue with Google"
          icon="i-simple-icons-google"
          size="lg"
          block
          :loading="signingIn"
          @click="onGoogle"
        />
        <p class="text-xs text-muted">
          Only hosts sign in. Your guests RSVP from their invitation email.
        </p>
      </div>
    </UCard>
  </div>
</template>
