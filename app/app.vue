<script setup lang="ts">
const { appName, appTagline } = useRuntimeConfig().public

useHead({ htmlAttrs: { lang: 'en' } })

useSeoMeta({
  title: appName,
  description: appTagline,
  ogTitle: appName,
  ogDescription: appTagline
})
</script>

<template>
  <UApp>
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
  </UApp>
</template>
