<script setup lang="ts">
import type { DropdownMenuItem, NavigationMenuItem } from '@nuxt/ui'

const { appName } = useRuntimeConfig().public
const { account, signOutUser } = useAuth()

const links: NavigationMenuItem[] = [
  { label: 'Events', to: '/events', icon: 'i-lucide-calendar' },
  { label: 'People', to: '/people', icon: 'i-lucide-users' },
  { label: 'Settings', to: '/settings', icon: 'i-lucide-settings' }
]

const userMenu = computed<DropdownMenuItem[][]>(() => [
  [{ label: account.value?.displayName ?? 'Signed in', type: 'label' as const, avatar: { src: account.value?.avatarUrl ?? undefined } }],
  [{ label: 'Sign out', icon: 'i-lucide-log-out', color: 'error' as const, onSelect: () => void handleSignOut() }]
])

async function handleSignOut(): Promise<void> {
  await signOutUser()
  await navigateTo('/')
}
</script>

<template>
  <div>
    <UHeader to="/events" :ui="{ center: 'gap-1' }">
      <template #title>
        <span class="font-bold">{{ appName }}</span>
      </template>

      <UNavigationMenu :items="links" />

      <template #right>
        <UColorModeButton />

        <UDropdownMenu v-if="account" :items="userMenu" :content="{ align: 'end' }">
          <UButton variant="ghost" color="neutral" trailing-icon="i-lucide-chevron-down" class="gap-2">
            <UAvatar :src="account.avatarUrl ?? undefined" :alt="account.displayName ?? 'User'" size="2xs" />
            <span class="hidden sm:inline">{{ account.displayName }}</span>
          </UButton>
        </UDropdownMenu>
        <UButton v-else to="/login" label="Sign in" size="sm" />
      </template>

      <template #body>
        <UNavigationMenu :items="links" orientation="vertical" class="-mx-2.5" />
      </template>
    </UHeader>

    <UMain>
      <UContainer class="py-6 sm:py-8">
        <slot />
      </UContainer>
    </UMain>
  </div>
</template>
