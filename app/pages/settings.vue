<script setup lang="ts">
const { appName } = useRuntimeConfig().public
useSeoMeta({ title: `Settings · ${appName}` })

const { account } = useAuth()
</script>

<template>
  <div class="space-y-6 max-w-2xl">
    <h1 class="text-2xl font-bold">
      Settings
    </h1>

    <UCard variant="subtle">
      <template #header>
        <h2 class="font-semibold">
          Account
        </h2>
      </template>
      <div class="flex items-center gap-3">
        <UAvatar :src="account?.avatarUrl ?? undefined" :alt="account?.displayName ?? 'You'" />
        <div class="min-w-0">
          <p class="font-medium truncate">
            {{ account?.displayName }}
          </p>
          <p class="text-sm text-muted truncate">
            {{ account?.email }}
          </p>
        </div>
      </div>
    </UCard>

    <UCard variant="subtle">
      <template #header>
        <h2 class="font-semibold">
          Reminders
        </h2>
      </template>
      <ReminderCheckpointsSetting />
    </UCard>
  </div>
</template>
