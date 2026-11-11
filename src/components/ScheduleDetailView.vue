<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import type { Schedule } from '../services/schedules'
import { vietnamDate, vietnamTime } from '../utils/week'
import { isSelf } from '../utils/relatedPerson'

const props = defineProps<{ schedule: Schedule | null; loading: boolean; errorKey: string; cancelling: boolean; cancelErrorKey: string; backKey: string }>()
const emit = defineEmits<{ back: []; retry: []; edit: []; cancelConfirmed: [] }>()
const { locale, t } = useI18n({ useScope: 'global' })
const confirmingCancel = ref(false)

function reloadDetail() {
  confirmingCancel.value = false
  emit('retry')
}

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
      <button class="btn btn-link px-0" type="button" :disabled="props.cancelling" @click="emit('back')">{{ t(props.backKey) }}</button>
    </div>

    <p v-if="props.loading" class="alert alert-light" role="status">{{ t('detail.loading') }}</p>
    <div v-else-if="props.errorKey" class="alert alert-warning" role="alert">
      {{ t(props.errorKey) }}
      <button class="btn btn-link btn-sm" type="button" @click="reloadDetail">{{ t('common.retry') }}</button>
    </div>
    <template v-else-if="props.schedule">
    <div v-if="props.cancelErrorKey" class="alert alert-warning" role="alert">
      {{ t(props.cancelErrorKey) }}
      <button class="btn btn-link btn-sm" type="button" @click="reloadDetail">{{ t('detail.reloadAfterCancel') }}</button>
    </div>
    <article class="detail-card">
      <div class="detail-card-header">
        <h2>{{ props.schedule.title }}</h2>
        <div class="d-flex align-items-center gap-2 flex-wrap">
          <span class="detail-status" :class="`detail-status-${props.schedule.status}`">
            {{ t(`detail.${props.schedule.status}`) }}
          </span>
          <button v-if="props.schedule.status === 'upcoming'" class="btn btn-outline-primary btn-sm"
            type="button" :disabled="props.cancelling" @click="emit('edit')">{{ t('detail.edit') }}</button>
          <button v-if="props.schedule.status === 'upcoming'" class="btn btn-outline-danger btn-sm"
            type="button" :disabled="props.cancelling" @click="confirmingCancel = true">{{ t('detail.cancel') }}</button>
        </div>
      </div>
      <div v-if="confirmingCancel && !props.cancelErrorKey && props.schedule.status === 'upcoming'"
        class="p-3 border-bottom bg-danger-subtle" role="group" :aria-label="t('detail.cancelConfirm')">
        <p class="mb-2 fw-semibold">{{ t('detail.cancelConfirm') }}</p>
        <div class="d-flex gap-2 flex-wrap">
          <button class="btn btn-danger btn-sm" type="button" :disabled="props.cancelling"
            @click="emit('cancelConfirmed')">{{ t(props.cancelling ? 'detail.cancelling' : 'detail.confirmCancel') }}</button>
          <button class="btn btn-outline-secondary btn-sm" type="button" :disabled="props.cancelling"
            @click="confirmingCancel = false">{{ t('detail.keepSchedule') }}</button>
        </div>
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
        <div><dt>{{ t('detail.relatedPerson') }}</dt><dd>{{ isSelf(props.schedule.related_person) ? t('week.me') : props.schedule.related_person }}</dd></div>
        <div><dt>{{ t('detail.preparation') }}</dt><dd class="detail-long-text">{{ props.schedule.preparation || t('detail.notProvided') }}</dd></div>
        <div><dt>{{ t('detail.notes') }}</dt><dd class="detail-long-text">{{ props.schedule.notes || t('detail.notProvided') }}</dd></div>
      </dl>
    </article>
    </template>
  </div>
</template>

<style src="../styles/detail.css"></style>
