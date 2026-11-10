<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { Schedule } from '../services/schedules'
import { vietnamDate, vietnamTime } from '../utils/week'

const props = defineProps<{ schedule: Schedule | null; loading: boolean; errorKey: string }>()
const emit = defineEmits<{ back: []; retry: [] }>()
const { locale, t } = useI18n({ useScope: 'global' })

const dateLabel = computed(() => {
  if (!props.schedule) return ''
  const date = vietnamDate(props.schedule.starts_at_utc)
  return locale.value === 'vi'
    ? `${date.slice(8)}/${date.slice(5, 7)}/${date.slice(0, 4)}`
    : `${date.slice(5, 7)}/${date.slice(8)}/${date.slice(0, 4)}`
})

const timeLabel = computed(() => {
  if (!props.schedule) return ''
  const start = vietnamTime(props.schedule.starts_at_utc)
  if (!props.schedule.ends_at_utc) return `${dateLabel.value} · ${start}`
  const end = vietnamTime(props.schedule.ends_at_utc)
  const endDate = vietnamDate(props.schedule.ends_at_utc)
  if (endDate === vietnamDate(props.schedule.starts_at_utc)) return `${dateLabel.value} · ${start}–${end}`
  const endLabel = locale.value === 'vi'
    ? `${endDate.slice(8)}/${endDate.slice(5, 7)}/${endDate.slice(0, 4)}`
    : `${endDate.slice(5, 7)}/${endDate.slice(8)}/${endDate.slice(0, 4)}`
  return `${dateLabel.value} ${start} – ${endLabel} ${end}`
})

const meetingLink = computed(() => {
  const value = props.schedule?.meeting_url
  if (!value) return null
  try {
    const url = new URL(value)
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null
  } catch {
    return null
  }
})
</script>

<template>
  <div class="detail-page">
    <div class="detail-heading">
      <h1>{{ t('detail.title') }}</h1>
      <p>{{ t('detail.subtitle') }}</p>
      <button class="btn btn-link px-0" type="button" @click="emit('back')">{{ t('detail.back') }}</button>
    </div>

    <p v-if="props.loading" class="alert alert-light" role="status">{{ t('detail.loading') }}</p>
    <div v-else-if="props.errorKey" class="alert alert-warning" role="alert">
      {{ t(props.errorKey) }}
      <button class="btn btn-link btn-sm" type="button" @click="emit('retry')">{{ t('common.retry') }}</button>
    </div>
    <article v-else-if="props.schedule" class="detail-card">
      <div class="detail-card-header">
        <h2>{{ props.schedule.title }}</h2>
        <span class="detail-status" :class="`detail-status-${props.schedule.status}`">
          {{ t(`detail.${props.schedule.status}`) }}
        </span>
      </div>
      <dl class="detail-fields">
        <div><dt>{{ t('detail.time') }}</dt><dd>{{ timeLabel }}<small>{{ t('week.timezone') }}</small></dd></div>
        <div><dt>{{ t('detail.mode') }}</dt><dd>
          {{ t(props.schedule.meeting_mode === 'online' ? 'week.online' : 'week.offline') }}
          <template v-if="props.schedule.meeting_mode === 'online' && meetingLink">
            · <a :href="meetingLink" target="_blank" rel="noopener noreferrer">{{ t('detail.meetingLink') }}</a>
          </template>
          <template v-else-if="props.schedule.meeting_mode === 'offline' && props.schedule.location">
            · {{ props.schedule.location }}
          </template>
        </dd></div>
        <div><dt>{{ t('detail.relatedPerson') }}</dt><dd>{{ props.schedule.related_person === 'Tôi' ? t('week.me') : props.schedule.related_person }}</dd></div>
        <div><dt>{{ t('detail.preparation') }}</dt><dd class="detail-long-text">{{ props.schedule.preparation || t('detail.notProvided') }}</dd></div>
        <div><dt>{{ t('detail.notes') }}</dt><dd class="detail-long-text">{{ props.schedule.notes || t('detail.notProvided') }}</dd></div>
      </dl>
    </article>
  </div>
</template>

<style src="../styles/detail.css"></style>
