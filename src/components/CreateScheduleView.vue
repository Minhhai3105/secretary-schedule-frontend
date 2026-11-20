<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { AuthError, refreshSession, type LoginResult } from '../services/auth'
import {
  checkScheduleConflicts,
  createSchedule,
  ScheduleCreateError,
  ScheduleLoadError,
  type Schedule,
  type ScheduleConflictResult,
  type ScheduleCreatePayload,
} from '../services/schedules'
import { todayInVietnam, vietnamDate, vietnamTime } from '../utils/week'
import { canonicalRelatedPerson, isSelf } from '../utils/relatedPerson'

const props = defineProps<{
  session: LoginResult
  relatedPeople: string[]
  initialData?: Record<string, unknown> | null
}>()
const emit = defineEmits<{
  cancel: []
  created: [schedule: Schedule]
  sessionUpdated: [session: LoginResult]
  sessionExpired: []
}>()
const { t } = useI18n({ useScope: 'global' })
const initialStart = typeof props.initialData?.starts_at_utc === 'string' ? props.initialData.starts_at_utc : ''
const initialEnd = typeof props.initialData?.ends_at_utc === 'string' ? props.initialData.ends_at_utc : ''
const initialDate = typeof props.initialData?.date === 'string' ? props.initialData.date : ''
const title = ref(typeof props.initialData?.title === 'string' ? props.initialData.title : '')
const date = ref(initialStart ? vietnamDate(initialStart) : initialDate || todayInVietnam())
const startTime = ref(initialStart ? vietnamTime(initialStart) : '')
const endTime = ref(initialEnd ? vietnamTime(initialEnd) : '')
const endDate = ref(initialEnd ? vietnamDate(initialEnd) : date.value)
const meetingMode = ref<'offline' | 'online'>(props.initialData?.meeting_mode === 'online' ? 'online' : 'offline')
const location = ref(typeof props.initialData?.location === 'string' ? props.initialData.location : '')
const meetingUrl = ref(typeof props.initialData?.meeting_url === 'string' ? props.initialData.meeting_url : '')
const relatedPerson = ref(
  typeof props.initialData?.related_person === 'string' && props.initialData.related_person.trim()
    ? canonicalRelatedPerson(props.initialData.related_person.trim())
    : 'Me',
)
const relatedPersonInput = computed({
  get: () => isSelf(relatedPerson.value) ? t('week.me') : relatedPerson.value,
  set: (value: string) => { relatedPerson.value = canonicalRelatedPerson(value) },
})
const preparation = ref(typeof props.initialData?.preparation === 'string' ? props.initialData.preparation : '')
const notes = ref(typeof props.initialData?.notes === 'string' ? props.initialData.notes : '')
const errorKey = ref('')
const timeError = ref(false)
const saving = ref(false)
const conflicts = ref<Schedule[]>([])
const showConflictModal = ref(false)
const checkingConflicts = ref(false)
const conflictCheckFailed = ref(false)
let conflictCheckTimer: ReturnType<typeof setTimeout> | null = null
let conflictRequestId = 0

function formatScheduleRange(item: Schedule): string {
  const start = `${vietnamDate(item.starts_at_utc)} ${vietnamTime(item.starts_at_utc)}`
  if (!item.ends_at_utc) return start
  return `${start} → ${vietnamTime(item.ends_at_utc)}`
}

async function fetchConflicts(startsAt: string, endsAt: string | null): Promise<Schedule[]> {
  const requestId = ++conflictRequestId
  checkingConflicts.value = true
  conflictCheckFailed.value = false
  try {
    let activeToken = props.session.access_token
    let res: ScheduleConflictResult
    try {
      res = await checkScheduleConflicts(activeToken, startsAt, endsAt)
    } catch (cause) {
      if (!(cause instanceof ScheduleLoadError) || cause.code !== 'unauthorized') throw cause
      const renewed = await refreshSession()
      if (!renewed) {
        emit('sessionExpired')
        throw cause
      }
      emit('sessionUpdated', renewed)
      activeToken = renewed.access_token
      res = await checkScheduleConflicts(activeToken, startsAt, endsAt)
    }
    if (requestId !== conflictRequestId) {
      return conflicts.value
    }
    conflicts.value = res.conflicts
    return res.conflicts
  } catch (cause) {
    if (requestId === conflictRequestId) {
      conflictCheckFailed.value = true
      throw cause
    }
    return conflicts.value
  } finally {
    if (requestId === conflictRequestId) {
      checkingConflicts.value = false
    }
  }
}

watch([date, startTime, endDate, endTime], () => {
  conflictRequestId++
  checkingConflicts.value = false
  conflictCheckFailed.value = false
  conflicts.value = []

  if (conflictCheckTimer) {
    clearTimeout(conflictCheckTimer)
    conflictCheckTimer = null
  }
  conflictCheckTimer = setTimeout(() => {
    if (!date.value || !startTime.value) {
      conflicts.value = []
      return
    }
    const startsAt = vietnamLocalToUtc(date.value, startTime.value)
    const endsAt = endTime.value ? vietnamLocalToUtc(endDate.value || date.value, endTime.value) : null
    if (!startsAt || (endsAt && endsAt <= startsAt)) {
      conflicts.value = []
      return
    }
    void fetchConflicts(startsAt, endsAt).catch(() => {
      // background typing checks do not block typing
    })
  }, 300)
})

onMounted(() => {
  if (date.value && startTime.value) {
    const startsAt = vietnamLocalToUtc(date.value, startTime.value)
    const endsAt = endTime.value ? vietnamLocalToUtc(endDate.value || date.value, endTime.value) : null
    if (startsAt && (!endsAt || endsAt > startsAt)) {
      void fetchConflicts(startsAt, endsAt).catch(() => {})
    }
  }
})

watch(date, (next, previous) => {
  if (endDate.value === previous) endDate.value = next
})

function vietnamLocalToUtc(day: string, time: string): string | null {
  const value = new Date(`${day}T${time}:00+07:00`)
  return Number.isNaN(value.getTime()) ? null : value.toISOString()
}

const isPastStart = computed(() => {
  if (!date.value || !startTime.value) return false
  const startsAt = vietnamLocalToUtc(date.value, startTime.value)
  return startsAt !== null && Date.parse(startsAt) < Date.now()
})

async function submit(forceProceed = false) {
  if (saving.value) return
  errorKey.value = ''
  timeError.value = false
  conflictCheckFailed.value = false

  if (!title.value.trim() || !date.value || !startTime.value) {
    errorKey.value = 'create.required'
    return
  }

  if (!forceProceed) {
    while (true) {
      if (conflictCheckTimer) {
        clearTimeout(conflictCheckTimer)
        conflictCheckTimer = null
      }
      const checkStartsAt = vietnamLocalToUtc(date.value, startTime.value)
      const checkEndsAt = endTime.value ? vietnamLocalToUtc(endDate.value || date.value, endTime.value) : null
      if (!checkStartsAt || (endTime.value && !checkEndsAt)) {
        errorKey.value = 'create.validationError'
        return
      }
      if (checkEndsAt && checkEndsAt <= checkStartsAt) {
        timeError.value = true
        return
      }

      let detectedConflicts: Schedule[]
      try {
        detectedConflicts = await fetchConflicts(checkStartsAt, checkEndsAt)
      } catch {
        return
      }

      const currentStartsAt = vietnamLocalToUtc(date.value, startTime.value)
      const currentEndsAt = endTime.value ? vietnamLocalToUtc(endDate.value || date.value, endTime.value) : null
      if (currentStartsAt !== checkStartsAt || currentEndsAt !== checkEndsAt) {
        continue
      }

      if (detectedConflicts.length > 0) {
        showConflictModal.value = true
        return
      }
      break
    }
  }

  showConflictModal.value = false
  const startsAt = vietnamLocalToUtc(date.value, startTime.value)
  const endsAt = endTime.value ? vietnamLocalToUtc(endDate.value || date.value, endTime.value) : null
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
    related_person: canonicalRelatedPerson(relatedPerson.value.trim() || 'Me'),
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
    emit('created', result)
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
function handleSubmit() {
  void submit(false)
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

    <form class="create-form" novalidate @submit.prevent="handleSubmit">
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
        <div v-if="endTime" class="mb-3">
          <label class="form-label" for="create-end-date">{{ t('create.endDate') }}</label>
          <input id="create-end-date" v-model="endDate" class="form-control" type="date" :aria-invalid="timeError" @input="timeError = false" />
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
          <input id="create-person" v-model="relatedPersonInput" class="form-control" maxlength="255" list="create-people" />
          <datalist id="create-people"><option v-for="person in relatedPeople" :key="person" :value="isSelf(person) ? t('week.me') : person" /></datalist>
        </div>
        <div class="mb-3"><label class="form-label" for="create-preparation">{{ t('create.preparation') }}</label>
          <textarea id="create-preparation" v-model="preparation" class="form-control" rows="3" /></div>
        <div class="mb-3"><label class="form-label" for="create-notes">{{ t('create.notes') }}</label>
          <textarea id="create-notes" v-model="notes" class="form-control" rows="3" /></div>
        <p class="create-timezone">{{ t('create.timezone') }}</p>
        <p v-if="isPastStart" class="alert alert-info small" role="note">{{ t('create.pastWarning') }}</p>
        <div v-if="conflicts.length > 0" class="alert alert-warning small mb-3" role="alert">
          <div class="fw-semibold mb-1">
            {{ t('create.conflictBanner', { count: conflicts.length }) }}
          </div>
          <ul class="mb-0 ps-3">
            <li v-for="c in conflicts" :key="c.id">
              <strong>{{ c.title }}</strong>: {{ formatScheduleRange(c) }}
            </li>
          </ul>
        </div>
        <div v-if="conflictCheckFailed" class="alert alert-warning small mb-3" role="alert">
          <div>{{ t('create.conflictCheckFailed') }}</div>
          <div class="mt-2 d-flex gap-2">
            <button class="btn btn-sm btn-outline-primary" type="button" :disabled="saving || checkingConflicts" @click="submit(false)">
              {{ t('common.retry') }}
            </button>
            <button class="btn btn-sm btn-warning" type="button" :disabled="saving || checkingConflicts" @click="submit(true)">
              {{ t('create.conflictProceed') }}
            </button>
          </div>
        </div>
        <p v-if="errorKey" class="alert alert-warning" role="alert">{{ t(errorKey) }}</p>
        <p v-if="saving" class="alert alert-info" role="status">{{ t('create.saving') }}</p>
        <div class="create-actions">
          <button class="btn btn-primary" type="submit" :disabled="saving || checkingConflicts">{{ saving ? t('create.saving') : t('create.save') }}</button>
          <button class="btn btn-outline-secondary" type="button" @click="emit('cancel')">{{ t('create.cancel') }}</button>
        </div>
      </fieldset>
    </form>

    <div v-if="showConflictModal" class="modal d-block" tabindex="-1" style="background-color: rgba(0,0,0,0.5);" role="dialog" aria-modal="true">
      <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title text-warning-emphasis">{{ t('create.conflictModalTitle') }}</h5>
            <button type="button" class="btn-close" aria-label="Close" @click="showConflictModal = false"></button>
          </div>
          <div class="modal-body">
            <p>{{ t('create.conflictModalMessage') }}</p>
            <ul class="list-group mb-3">
              <li v-for="c in conflicts" :key="c.id" class="list-group-item d-flex justify-content-between align-items-center">
                <span><strong>{{ c.title }}</strong></span>
                <small class="text-muted">{{ formatScheduleRange(c) }}</small>
              </li>
            </ul>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-outline-secondary" @click="showConflictModal = false">
              {{ t('create.conflictChooseAnother') }}
            </button>
            <button type="button" class="btn btn-warning" @click="submit(true)">
              {{ t('create.conflictProceed') }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<style src="../styles/create.css"></style>
