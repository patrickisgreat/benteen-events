<script setup lang="ts">
import type { EventRsvpRoster } from '~/composables/useEventRsvps'

const props = defineProps<{ roster: EventRsvpRoster, showNoReply?: boolean }>()

const sections = computed(() =>
  [
    { key: 'going', label: 'Going', icon: 'i-lucide-check', color: 'text-green-500', people: props.roster.going },
    { key: 'maybe', label: 'Maybe', icon: 'i-lucide-circle-help', color: 'text-amber-500', people: props.roster.maybe },
    { key: 'no', label: 'Can\'t make it', icon: 'i-lucide-x', color: 'text-muted', people: props.roster.no }
  ].filter(s => s.people.length > 0)
)

const hasAnything = computed(() =>
  props.roster.total > 0 || (props.showNoReply === true && props.roster.noReply.length > 0)
)

// Extra guests across everyone going (headcount − the going people themselves).
const guestCount = computed(() => Math.max(0, props.roster.headcount - props.roster.going.length))
</script>

<template>
  <div v-if="hasAnything" class="space-y-3">
    <!-- Headcount including guests, when anyone is bringing a +1. -->
    <p v-if="guestCount > 0" class="text-sm font-medium">
      {{ roster.headcount }} expected
      <span class="text-muted font-normal">({{ roster.going.length }} going + {{ guestCount }} guest{{ guestCount === 1 ? '' : 's' }})</span>
    </p>

    <div v-for="s in sections" :key="s.key">
      <p class="text-xs font-semibold text-muted mb-1.5 flex items-center gap-1">
        <UIcon :name="s.icon" :class="s.color" /> {{ s.label }} · {{ s.people.length }}
      </p>
      <ul class="flex flex-wrap gap-1.5">
        <li
          v-for="p in s.people"
          :key="p.key"
          class="inline-flex items-center gap-1.5 rounded-full bg-elevated/60 py-0.5 pl-2.5 pr-2.5"
        >
          <span class="text-sm truncate max-w-40">{{ p.name }}</span>
          <UBadge
            v-if="p.plusOnes > 0"
            :label="`+${p.plusOnes}`"
            color="primary"
            variant="subtle"
            size="sm"
            :aria-label="`bringing ${p.plusOnes} guest${p.plusOnes === 1 ? '' : 's'}`"
          />
        </li>
      </ul>
    </div>

    <div v-if="showNoReply && roster.noReply.length">
      <p class="text-xs font-semibold text-muted mb-1.5 flex items-center gap-1">
        <UIcon name="i-lucide-clock" /> No reply yet · {{ roster.noReply.length }}
      </p>
      <p class="text-sm text-muted">
        {{ roster.noReply.map(p => p.name).join(', ') }}
      </p>
    </div>
  </div>
  <p v-else class="text-sm text-muted">
    No RSVPs yet.
  </p>
</template>
