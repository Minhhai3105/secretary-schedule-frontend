<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { AuthError, refreshSession, type LoginResult } from '../services/auth'
import { createSchedule, ScheduleCreateError, type Schedule, type ScheduleCreatePayload } from '../services/schedules'
import { todayInVietnam } from '../utils/week'

const props = defineProps<{ session: LoginResult; relatedPeople: string[] }>()
const emit = defineEmits<{
  cancel: []
  created: [schedule: Schedule]
  sessionUpdated: [session: LoginResult]
  sessionExpired: []
}>()
const { t } = useI18n({ useScope: 'global' })
const title = ref('')
const date = ref(todayInVietnam())
const startTime = ref('')
const endTime = ref('')
const meetingMode = ref<'offline' | 'online'>('offline')
const location = ref('')
const meetingUrl = ref('')
const relatedPerson = ref('Tôi')
const preparation = ref('')
const notes = ref('')
const errorKey = ref('')
const timeError = ref(false)
const saving = ref(false)
const createdSchedule = ref<Schedule | null>(null)

function vietnamLocalToUtc(day: string, time: string): string | null {
  const value = new Date(`${day}T${time}:00+07:00`)
  return Number.isNaN(value.getTime()) ? null : value.toISOString()
}

const isPastStart = computed(() => {
  if (!date.value || !startTime.value) return false
  const startsAt = vietnamLocalToUtc(date.value, startTime.value)
  return startsAt !== null && Date.parse(startsAt) < Date.now()
})

async function submit() {
  if (saving.value) return
  errorKey.value = ''
  timeError.value = false
  if (!title.value.trim() || !date.value || !startTime.value) {
    errorKey.value = 'create.required'
    return
  }
  const startsAt = vietnamLocalToUtc(date.value, startTime.value)
  const endsAt = endTime.value ? vietnamLocalToUtc(date.value, endTime.value) : null
  if (!startsAt || (endTime.value && !endsAt)) {
    errorKey.value = 'create.validationError'
    return
  }
  if (endsAt && endsAt <= startsAt) {
    timeError.value = true
    return
  }
  const urlText = meetingMode.value === 'online' ? meetingUrl.value.trim() : ''
  if (urlText) {
    try {
      const parsed = new URL(urlText)
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') throw new Error('Invalid protocol')
    } catch {
      errorKey.value = 'create.invalidUrl'
      return
    }
  }
  const payload: ScheduleCreatePayload = {
    title: title.value.trim(),
    starts_at_utc: startsAt,
    ends_at_utc: endsAt,
    meeting_mode: meetingMode.value,
    location: meetingMode.value === 'offline' ? location.value.trim() || null : null,
    meeting_url: urlText || null,
    related_person: relatedPerson.value.trim() || 'Tôi',
    preparation: preparation.value.trim() || null,
    notes: notes.value.trim() || null,
  }
  saving.value = true
  try {
    let result: Schedule
    try {
      result = await createSchedule(props.session.access_token, payload)
    } catch (cause) {
      if (!(cause instanceof ScheduleCreateError) || cause.code !== 'unauthorized') throw cause
      const renewed = await refreshSession()
      if (!renewed) {
        emit('sessionExpired')
        return
      }
      emit('sessionUpdated', renewed)
      result = await createSchedule(renewed.access_token, payload)
    }
    createdSchedule.value = result
  } catch (cause) {
    if (cause instanceof ScheduleCreateError && cause.code === 'unauthorized') {
      emit('sessionExpired')
    } else if (cause instanceof ScheduleCreateError && cause.code === 'validation') {
      errorKey.value = 'create.validationError'
    } else if (cause instanceof ScheduleCreateError && cause.code === 'network') {
      errorKey.value = 'create.networkError'
    } else if (cause instanceof AuthError && cause.code === 'restoreNetwork') {
      errorKey.value = 'create.networkError'
    } else {
      errorKey.value = 'create.saveError'
    }
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <section class="create-page">
    <div class="create-heading">
      <h1>{{ t('create.title') }}</h1>
      <p>{{ t('create.subtitle') }}</p>
      <button class="btn btn-link px-0 create-back" type="button" :disabled="saving" @click="emit('cancel')">
        {{ t('create.back') }}
      </button>
    </div>

    <div v-if="createdSchedule" class="create-result" role="status">
      <h2>{{ t('create.success') }}</h2>
      <p>{{ t('create.successHint') }}</p>
      <button class="btn btn-primary" type="button" @click="emit('created', createdSchedule)">{{ t('create.viewCreated') }}</button>
      <button class="btn btn-outline-secondary" type="button" @click="createdSchedule = null">{{ t('create.backToForm') }}</button>
    </div>

    <form v-else class="create-form" novalidate @submit.prevent="submit">
      <fieldset :disabled="saving">
        <div class="mb-3">
          <label class="form-label" for="create-title">{{ t('create.titleLabel') }} *</label>
          <input id="create-title" v-model="title" class="form-control" maxlength="255" required :placeholder="t('create.titlePlaceholder')" />
        </div>
        <div class="create-row mb-3">
          <div><label class="form-label" for="create-date">{{ t('create.date') }} *</label>
            <input id="create-date" v-model="date" class="form-control" type="date" required /></div>
          <div><label class="form-label" for="create-start">{{ t('create.startTime') }} *</label>
            <input id="create-start" v-model="startTime" class="form-control" type="time" required @input="timeError = false" /></div>
          <div><label class="form-label" for="create-end">{{ t('create.endTime') }}</label>
            <input id="create-end" v-model="endTime" class="form-control" type="time" :aria-invalid="timeError" @input="timeError = false" />
            <small v-if="timeError" class="text-danger">{{ t('create.timeError') }}</small></div>
        </div>
        <div class="mb-3">
          <span class="form-label d-block">{{ t('create.mode') }} *</span>
          <div class="create-mode">
            <label><input v-model="meetingMode" type="radio" value="offline" />{{ t('week.offline') }}</label>
            <label><input v-model="meetingMode" type="radio" value="online" />{{ t('week.online') }}</label>
          </div>
        </div>
        <div v-if="meetingMode === 'offline'" class="mb-3">
          <label class="form-label" for="create-location">{{ t('create.location') }}</label>
          <input id="create-location" v-model="location" class="form-control" maxlength="500" :placeholder="t('create.locationPlaceholder')" />
        </div>
        <div v-else class="mb-3">
          <label class="form-label" for="create-url">{{ t('create.meetingUrl') }}</label>
          <input id="create-url" v-model="meetingUrl" class="form-control" type="url" maxlength="2048" :placeholder="t('create.meetingUrlPlaceholder')" />
        </div>
        <div class="mb-3">
          <label class="form-label" for="create-person">{{ t('create.relatedPerson') }}</label>
          <input id="create-person" v-model="relatedPerson" class="form-control" maxlength="255" list="create-people" />
          <datalist id="create-people"><option v-for="person in relatedPeople" :key="person" :value="person" /></datalist>
        </div>
        <div class="mb-3"><label class="form-label" for="create-preparation">{{ t('create.preparation') }}</label>
          <textarea id="create-preparation" v-model="preparation" class="form-control" rows="3" /></div>
        <div class="mb-3"><label class="form-label" for="create-notes">{{ t('create.notes') }}</label>
          <textarea id="create-notes" v-model="notes" class="form-control" rows="3" /></div>
        <p class="create-timezone">{{ t('create.timezone') }}</p>
        <p v-if="isPastStart" class="alert alert-info small" role="note">{{ t('create.pastWarning') }}</p>
        <p v-if="errorKey" class="alert alert-warning" role="alert">{{ t(errorKey) }}</p>
        <p v-if="saving" class="alert alert-info" role="status">{{ t('create.saving') }}</p>
        <div class="create-actions">
          <button class="btn btn-primary" type="submit">{{ t('create.save') }}</button>
          <button class="btn btn-outline-secondary" type="button" @click="emit('cancel')">{{ t('create.cancel') }}</button>
        </div>
      </fieldset>
    </form>
  </section>
</template>

<style src="../styles/create.css"></style>
