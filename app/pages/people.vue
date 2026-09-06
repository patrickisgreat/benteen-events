<script setup lang="ts">
const { appName } = useRuntimeConfig().public
useSeoMeta({ title: `People · ${appName}` })
</script>

<template>
  <div class="space-y-6">
    <h1 class="text-2xl font-bold">
      People
    </h1>
    <ContactsComposer />
  </div>
</template>
