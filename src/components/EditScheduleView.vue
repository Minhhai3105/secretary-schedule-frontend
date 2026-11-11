<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { AuthError, refreshSession, type LoginResult } from '../services/auth'
import { ScheduleUpdateError, updateSchedule, type Schedule, type ScheduleUpdatePayload } from '../services/schedules'
import { vietnamDate, vietnamTime } from '../utils/week'
import { canonicalRelatedPerson, isSelf } from '../utils/relatedPerson'

const props = defineProps<{
  session: LoginResult
  schedule: Schedule
  relatedPeople: string[]
  initialOverrides?: Record<string, unknown> | null
}>()
const emit = defineEmits<{
  cancel: []
  saved: [schedule: Schedule]
  reload: []
  sessionUpdated: [session: LoginResult]
  sessionExpired: []
}>()
const { t } = useI18n({ useScope: 'global' })
const ov = props.initialOverrides ?? null
const initialStartsAt = typeof ov?.starts_at_utc === 'string' ? ov.starts_at_utc : props.schedule.starts_at_utc
const hasEndsAtOverride = ov !== null && Object.hasOwn(ov, 'ends_at_utc')
const initialEndsAt = hasEndsAtOverride
  ? (typeof ov?.ends_at_utc === 'string' ? ov.ends_at_utc : null)
  : props.schedule.ends_at_utc
const title = ref(typeof ov?.title === 'string' ? ov.title : props.schedule.title)
const date = ref(vietnamDate(initialStartsAt))
const startTime = ref(vietnamTime(initialStartsAt))
const endDate = ref(initialEndsAt ? vietnamDate(initialEndsAt) : date.value)
const endTime = ref(initialEndsAt ? vietnamTime(initialEndsAt) : '')
const meetingMode = ref<'offline' | 'online'>(
  ov?.meeting_mode === 'online' || ov?.meeting_mode === 'offline' ? ov.meeting_mode : props.schedule.meeting_mode,
)
const location = ref(
  ov && Object.hasOwn(ov, 'location')
    ? (typeof ov.location === 'string' ? ov.location : '')
    : (props.schedule.location ?? ''),
)
const meetingUrl = ref(
  ov && Object.hasOwn(ov, 'meeting_url')
    ? (typeof ov.meeting_url === 'string' ? ov.meeting_url : '')
    : (props.schedule.meeting_url ?? ''),
)
const relatedPerson = ref(
  typeof ov?.related_person === 'string' && ov.related_person.trim()
    ? canonicalRelatedPerson(ov.related_person.trim())
    : canonicalRelatedPerson(props.schedule.related_person),
)
const relatedPersonInput = computed({
  get: () => isSelf(relatedPerson.value) ? t('week.me') : relatedPerson.value,
  set: (value: string) => { relatedPerson.value = canonicalRelatedPerson(value) },
})
const preparation = ref(
  ov && Object.hasOwn(ov, 'preparation')
    ? (typeof ov.preparation === 'string' ? ov.preparation : '')
    : (props.schedule.preparation ?? ''),
)
const notes = ref(
  ov && Object.hasOwn(ov, 'notes')
    ? (typeof ov.notes === 'string' ? ov.notes : '')
    : (props.schedule.notes ?? ''),
)
const errorKey = ref('')
const timeError = ref(false)
const saving = ref(false)

function vietnamLocalToUtc(day: string, time: string): string | null {
  const value = new Date(`${day}T${time}:00+07:00`)
  return Number.isNaN(value.getTime()) ? null : value.toISOString()
}

async function submit() {
  if (saving.value) return
  errorKey.value = ''
  timeError.value = false
  if (!title.value.trim() || !date.value || !startTime.value) {
    errorKey.value = 'create.required'
    return
  }
  const startsAt = vietnamLocalToUtc(date.value, startTime.value)
  const endsAt = endTime.value ? vietnamLocalToUtc(endDate.value || date.value, endTime.value) : null
  if (!startsAt || (endTime.value && !endsAt)) {
    errorKey.value = 'edit.validationError'
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
  const payload: ScheduleUpdatePayload = {
    version: props.schedule.version,
    title: title.value.trim(),
    starts_at_utc: startsAt,
    ends_at_utc: endsAt,
    meeting_mode: meetingMode.value,
    location: meetingMode.value === 'offline' ? location.value.trim() || null : null,
    meeting_url: urlText || null,
    related_person: canonicalRelatedPerson(relatedPerson.value.trim() || 'Me'),
    preparation: preparation.value.trim() || null,
    notes: notes.value.trim() || null,
  }
  const previous = {
    title: props.schedule.title,
    starts_at_utc: new Date(props.schedule.starts_at_utc).toISOString(),
    ends_at_utc: props.schedule.ends_at_utc ? new Date(props.schedule.ends_at_utc).toISOString() : null,
    meeting_mode: props.schedule.meeting_mode,
    location: props.schedule.location,
    meeting_url: props.schedule.meeting_url,
    related_person: canonicalRelatedPerson(props.schedule.related_person),
    preparation: props.schedule.preparation,
    notes: props.schedule.notes,
  }
  const { version: _version, ...changes } = payload
  if (JSON.stringify(changes) === JSON.stringify(previous)) {
    errorKey.value = 'edit.noChanges'
    return
  }

  saving.value = true
  try {
    let result: Schedule
    try {
      result = await updateSchedule(props.session.access_token, props.schedule.id, payload)
    } catch (cause) {
      if (!(cause instanceof ScheduleUpdateError) || cause.code !== 'unauthorized') throw cause
      const renewed = await refreshSession()
      if (!renewed) {
        emit('sessionExpired')
        return
      }
      emit('sessionUpdated', renewed)
      result = await updateSchedule(renewed.access_token, props.schedule.id, payload)
    }
    emit('saved', result)
  } catch (cause) {
    if (cause instanceof ScheduleUpdateError && cause.code === 'unauthorized') {
      emit('sessionExpired')
    } else if (cause instanceof ScheduleUpdateError && cause.code === 'conflict') {
      errorKey.value = 'edit.conflict'
    } else if (cause instanceof ScheduleUpdateError && cause.code === 'cannotEdit') {
      errorKey.value = 'edit.cannotEdit'
    } else if (cause instanceof ScheduleUpdateError && cause.code === 'notFound') {
      errorKey.value = 'detail.notFound'
    } else if (cause instanceof ScheduleUpdateError && cause.code === 'validation') {
      errorKey.value = 'edit.validationError'
    } else if (cause instanceof ScheduleUpdateError && cause.code === 'network') {
      errorKey.value = 'edit.networkError'
    } else if (cause instanceof AuthError && cause.code === 'restoreNetwork') {
      errorKey.value = 'edit.networkError'
    } else {
      errorKey.value = 'edit.saveError'
    }
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <section class="create-page">
    <div class="create-heading">
      <h1>{{ t('edit.title') }}</h1>
      <p>{{ t('edit.subtitle') }}</p>
      <button class="btn btn-link px-0 create-back" type="button" :disabled="saving" @click="emit('cancel')">{{ t('edit.back') }}</button>
    </div>

    <form class="create-form" novalidate @submit.prevent="submit">
      <fieldset :disabled="saving">
        <div class="mb-3">
          <label class="form-label" for="edit-title">{{ t('create.titleLabel') }} *</label>
          <input id="edit-title" v-model="title" class="form-control" maxlength="255" required />
        </div>
        <div class="create-row mb-3">
          <div><label class="form-label" for="edit-date">{{ t('create.date') }} *</label>
            <input id="edit-date" v-model="date" class="form-control" type="date" required /></div>
          <div><label class="form-label" for="edit-start">{{ t('create.startTime') }} *</label>
            <input id="edit-start" v-model="startTime" class="form-control" type="time" required @input="timeError = false" /></div>
          <div><label class="form-label" for="edit-end">{{ t('create.endTime') }}</label>
            <input id="edit-end" v-model="endTime" class="form-control" type="time" :aria-invalid="timeError" @input="timeError = false" />
            <small v-if="timeError" class="text-danger">{{ t('create.timeError') }}</small></div>
        </div>
        <div v-if="endTime" class="mb-3">
          <label class="form-label" for="edit-end-date">{{ t('edit.endDate') }}</label>
          <input id="edit-end-date" v-model="endDate" class="form-control" type="date" :aria-invalid="timeError" @input="timeError = false" />
        </div>
        <div class="mb-3">
          <span class="form-label d-block">{{ t('create.mode') }} *</span>
          <div class="create-mode">
            <label><input v-model="meetingMode" type="radio" value="offline" />{{ t('week.offline') }}</label>
            <label><input v-model="meetingMode" type="radio" value="online" />{{ t('week.online') }}</label>
          </div>
        </div>
        <div v-if="meetingMode === 'offline'" class="mb-3">
          <label class="form-label" for="edit-location">{{ t('create.location') }}</label>
          <input id="edit-location" v-model="location" class="form-control" maxlength="500" />
        </div>
        <div v-else class="mb-3">
          <label class="form-label" for="edit-url">{{ t('create.meetingUrl') }}</label>
          <input id="edit-url" v-model="meetingUrl" class="form-control" type="url" maxlength="2048" />
        </div>
        <div class="mb-3">
          <label class="form-label" for="edit-person">{{ t('create.relatedPerson') }}</label>
          <input id="edit-person" v-model="relatedPersonInput" class="form-control" maxlength="255" list="edit-people" />
          <datalist id="edit-people"><option v-for="person in relatedPeople" :key="person" :value="isSelf(person) ? t('week.me') : person" /></datalist>
        </div>
        <div class="mb-3"><label class="form-label" for="edit-preparation">{{ t('create.preparation') }}</label>
          <textarea id="edit-preparation" v-model="preparation" class="form-control" rows="3" /></div>
        <div class="mb-3"><label class="form-label" for="edit-notes">{{ t('create.notes') }}</label>
          <textarea id="edit-notes" v-model="notes" class="form-control" rows="3" /></div>
        <p class="create-timezone">{{ t('create.timezone') }}</p>
        <div v-if="errorKey" class="alert alert-warning" role="alert">
          {{ t(errorKey) }}
          <button v-if="['edit.conflict', 'edit.cannotEdit', 'detail.notFound'].includes(errorKey)" class="btn btn-link btn-sm"
            type="button" @click="emit('reload')">{{ t('edit.reload') }}</button>
        </div>
        <p v-if="saving" class="alert alert-info" role="status">{{ t('edit.saving') }}</p>
        <div class="create-actions">
          <button class="btn btn-primary" type="submit">{{ t('edit.save') }}</button>
          <button class="btn btn-outline-secondary" type="button" @click="emit('cancel')">{{ t('create.cancel') }}</button>
        </div>
      </fieldset>
    </form>
  </section>
</template>

<style src="../styles/create.css"></style>
