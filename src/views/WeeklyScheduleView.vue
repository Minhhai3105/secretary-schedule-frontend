<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { AuthError, refreshSession, type LoginResult } from '../services/auth'
import { cancelSchedule, getSchedule, listSchedules, ScheduleCancelError, ScheduleLoadError, type Schedule } from '../services/schedules'
import ScheduleDetailView from '../components/ScheduleDetailView.vue'
import CreateScheduleView from '../components/CreateScheduleView.vue'
import EditScheduleView from '../components/EditScheduleView.vue'
import { mondayOf, shiftDate, todayInVietnam, vietnamDate, vietnamTime, weekDates } from '../utils/week'

const props = defineProps<{ session: LoginResult; loggingOut: boolean; logoutError: string }>()
const emit = defineEmits<{
  sessionUpdated: [session: LoginResult]
  sessionExpired: []
  logoutRequested: []
}>()
const { locale, t } = useI18n({ useScope: 'global' })
const weekStart = ref(mondayOf(todayInVietnam()))
const selectedPerson = ref('')
const schedules = ref<Schedule[]>([])
const relatedPeople = ref<string[]>([])
const loading = ref(false)
const errorKey = ref('')
const creatingSchedule = ref(false)
const editingSchedule = ref(false)
const selectedScheduleId = ref<string | null>(null)
const selectedSchedule = ref<Schedule | null>(null)
const detailLoading = ref(false)
const detailErrorKey = ref('')
const cancellingSchedule = ref(false)
const cancelErrorKey = ref('')
let detailRequest = 0
const days = computed(() => weekDates(weekStart.value))
const weekdayKeys = ['week.monday', 'week.tuesday', 'week.wednesday', 'week.thursday', 'week.friday', 'week.saturday', 'week.sunday']
const schedulesByDay = computed(() => {
  const grouped = new Map<string, Schedule[]>()
  for (const schedule of schedules.value) {
    const date = vietnamDate(schedule.starts_at_utc)
    grouped.set(date, [...(grouped.get(date) ?? []), schedule])
  }
  return grouped
})
const weekLabel = computed(() => {
  const start = weekStart.value
  const end = days.value[6]
  if (locale.value === 'vi' && start.slice(0, 7) === end.slice(0, 7)) {
    return `${start.slice(8)}–${end.slice(8)}/${end.slice(5, 7)}/${end.slice(0, 4)}`
  }
  const formatter = new Intl.DateTimeFormat(locale.value === 'vi' ? 'vi-VN' : 'en-US', {
    timeZone: 'UTC', day: 'numeric', month: 'short', year: 'numeric',
  })
  return `${formatter.format(new Date(`${start}T00:00:00Z`))} – ${formatter.format(new Date(`${end}T00:00:00Z`))}`
})

function personLabel(person: string): string {
  return person === 'Tôi' ? t('week.me') : person
}

function timeLabel(schedule: Schedule): string {
  const start = vietnamTime(schedule.starts_at_utc)
  if (!schedule.ends_at_utc) return start
  const end = vietnamTime(schedule.ends_at_utc)
  const endDate = vietnamDate(schedule.ends_at_utc)
  if (endDate === vietnamDate(schedule.starts_at_utc)) return `${start}–${end}`
  const shortDate = locale.value === 'vi'
    ? `${endDate.slice(8)}/${endDate.slice(5, 7)}`
    : `${endDate.slice(5, 7)}/${endDate.slice(8)}`
  return `${start}–${shortDate} ${end}`
}

async function load() {
  if (loading.value) return
  loading.value = true
  errorKey.value = ''
  try {
    const from = weekStart.value
    const to = days.value[6]
    let result
    try {
      result = await listSchedules(props.session.access_token, from, to, selectedPerson.value)
    } catch (cause) {
      if (!(cause instanceof ScheduleLoadError) || cause.code !== 'unauthorized') throw cause
      const renewed = await refreshSession()
      if (!renewed) {
        emit('sessionExpired')
        return
      }
      emit('sessionUpdated', renewed)
      result = await listSchedules(renewed.access_token, from, to, selectedPerson.value)
    }
    schedules.value = result.schedules
    relatedPeople.value = result.related_people
  } catch (cause) {
    if (cause instanceof ScheduleLoadError && cause.code === 'unauthorized') {
      emit('sessionExpired')
    } else if (cause instanceof ScheduleLoadError && cause.code === 'network') {
      errorKey.value = 'week.networkError'
    } else if (cause instanceof AuthError && cause.code === 'restoreNetwork') {
      errorKey.value = 'week.networkError'
    } else {
      errorKey.value = 'week.loadError'
    }
  } finally {
    loading.value = false
  }
}

function changeWeek(offset: number) {
  weekStart.value = shiftDate(weekStart.value, offset * 7)
  void load()
}

function goToToday() {
  weekStart.value = mondayOf(todayInVietnam())
  void load()
}

function selectPerson(person: string) {
  selectedPerson.value = person
  void load()
}

async function loadDetail() {
  const id = selectedScheduleId.value
  if (!id) return
  const request = ++detailRequest
  detailLoading.value = true
  detailErrorKey.value = ''
  cancelErrorKey.value = ''
  selectedSchedule.value = null
  try {
    let result: Schedule
    try {
      result = await getSchedule(props.session.access_token, id)
    } catch (cause) {
      if (!(cause instanceof ScheduleLoadError) || cause.code !== 'unauthorized') throw cause
      const renewed = await refreshSession()
      if (!renewed) {
        if (request === detailRequest) emit('sessionExpired')
        return
      }
      emit('sessionUpdated', renewed)
      result = await getSchedule(renewed.access_token, id)
    }
    if (request === detailRequest) selectedSchedule.value = result
  } catch (cause) {
    if (request !== detailRequest) return
    if (cause instanceof ScheduleLoadError && cause.code === 'unauthorized') {
      emit('sessionExpired')
    } else if (cause instanceof ScheduleLoadError && cause.code === 'notFound') {
      detailErrorKey.value = 'detail.notFound'
    } else if (cause instanceof ScheduleLoadError && cause.code === 'network') {
      detailErrorKey.value = 'detail.networkError'
    } else if (cause instanceof AuthError && cause.code === 'restoreNetwork') {
      detailErrorKey.value = 'detail.networkError'
    } else {
      detailErrorKey.value = 'detail.loadError'
    }
  } finally {
    if (request === detailRequest) detailLoading.value = false
  }
}

function showCreatedSchedule(schedule: Schedule) {
  weekStart.value = mondayOf(vietnamDate(schedule.starts_at_utc))
  selectedPerson.value = ''
  creatingSchedule.value = false
  openDetail(schedule.id)
  void load()
}

function openDetail(id: string) {
  selectedScheduleId.value = id
  void loadDetail()
}

function openEdit() {
  if (selectedSchedule.value?.status === 'upcoming') editingSchedule.value = true
}

function saveEditedSchedule(schedule: Schedule) {
  selectedSchedule.value = schedule
  editingSchedule.value = false
  weekStart.value = mondayOf(vietnamDate(schedule.starts_at_utc))
  selectedPerson.value = ''
  void load()
}

function reloadAfterEdit() {
  editingSchedule.value = false
  void loadDetail()
}

async function confirmCancel() {
  const schedule = selectedSchedule.value
  if (!schedule || schedule.status !== 'upcoming' || cancellingSchedule.value) return
  cancellingSchedule.value = true
  cancelErrorKey.value = ''
  try {
    let result: Schedule
    try {
      result = await cancelSchedule(props.session.access_token, schedule.id, schedule.version)
    } catch (cause) {
      if (!(cause instanceof ScheduleCancelError) || cause.code !== 'unauthorized') throw cause
      const renewed = await refreshSession()
      if (!renewed) {
        emit('sessionExpired')
        return
      }
      emit('sessionUpdated', renewed)
      result = await cancelSchedule(renewed.access_token, schedule.id, schedule.version)
    }
    selectedSchedule.value = result
    void load()
  } catch (cause) {
    if (cause instanceof ScheduleCancelError && cause.code === 'unauthorized') {
      emit('sessionExpired')
    } else if (cause instanceof ScheduleCancelError && cause.code === 'conflict') {
      cancelErrorKey.value = 'detail.cancelConflict'
    } else if (cause instanceof ScheduleCancelError && cause.code === 'alreadyCancelled') {
      cancelErrorKey.value = 'detail.alreadyCancelled'
    } else if (cause instanceof ScheduleCancelError && cause.code === 'notFound') {
      cancelErrorKey.value = 'detail.notFound'
    } else if (cause instanceof ScheduleCancelError && cause.code === 'network') {
      cancelErrorKey.value = 'detail.cancelNetwork'
    } else if (cause instanceof AuthError && cause.code === 'restoreNetwork') {
      cancelErrorKey.value = 'detail.cancelNetwork'
    } else {
      cancelErrorKey.value = 'detail.cancelFailed'
    }
  } finally {
    cancellingSchedule.value = false
  }
}

function closeDetail() {
  editingSchedule.value = false
  ++detailRequest
  selectedScheduleId.value = null
  selectedSchedule.value = null
  detailLoading.value = false
  detailErrorKey.value = ''
  cancelErrorKey.value = ''
}

onMounted(() => { void load() })
</script>

<template>
  <div class="week-shell">
    <aside class="week-sidebar">
      <div class="week-brand">{{ t('intro.brand') }}<small>{{ t('week.privateSchedule') }}</small></div>
      <nav :aria-label="t('week.navigation')">
        <span class="week-nav-active" aria-current="page">▦ &nbsp;{{ t('week.title') }}</span>
      </nav>
      <div class="week-sidebar-bottom">
        <p class="week-privacy">{{ t('week.privacy') }}</p>
        <div class="week-profile">
          <div class="week-avatar" aria-hidden="true">{{ props.session.user.name.trim().charAt(0).toUpperCase() }}</div>
          <div class="week-user"><strong>{{ props.session.user.name }}</strong><small>{{ props.session.user.email }}</small></div>
        </div>
        <button class="btn btn-outline-secondary btn-sm w-100" type="button" :disabled="props.loggingOut || loading"
          @click="emit('logoutRequested')">{{ t(props.loggingOut ? 'session.loggingOut' : 'session.logout') }}</button>
      </div>
    </aside>

    <div class="week-area">
      <header class="week-topbar">
        <span>{{ t('week.personal') }} &nbsp;/&nbsp; <strong>{{ t(creatingSchedule ? 'create.title' : editingSchedule ? 'edit.title' : selectedScheduleId ? 'detail.title' : 'week.title') }}</strong></span>
        <span>{{ t('week.timezone') }}</span>
      </header>
      <main class="week-content">
        <p v-if="props.logoutError" class="alert alert-danger" role="alert">{{ t(props.logoutError) }}</p>
        <CreateScheduleView v-if="creatingSchedule" :session="props.session" :related-people="relatedPeople"
          @cancel="creatingSchedule = false" @created="showCreatedSchedule"
          @session-updated="emit('sessionUpdated', $event)" @session-expired="emit('sessionExpired')" />
        <EditScheduleView v-else-if="editingSchedule && selectedSchedule" :session="props.session"
          :schedule="selectedSchedule" :related-people="relatedPeople" @cancel="editingSchedule = false"
          @saved="saveEditedSchedule" @reload="reloadAfterEdit"
          @session-updated="emit('sessionUpdated', $event)" @session-expired="emit('sessionExpired')" />
        <ScheduleDetailView v-else-if="selectedScheduleId" :schedule="selectedSchedule" :loading="detailLoading"
          :error-key="detailErrorKey" :cancelling="cancellingSchedule" :cancel-error-key="cancelErrorKey"
          @back="closeDetail" @retry="loadDetail" @edit="openEdit" @cancel-confirmed="confirmCancel" />
        <template v-else>
        <div class="week-heading">
          <div><h1>{{ t('week.title') }}</h1><p>{{ t('week.subtitle') }}</p></div>
          <button class="btn btn-primary" type="button" :disabled="loading" @click="creatingSchedule = true">{{ t('create.open') }}</button>
        </div>

        <div class="week-controls">
          <div class="week-navigation">
            <button class="btn btn-outline-secondary" type="button" :disabled="loading" @click="changeWeek(-1)">{{ t('week.previous') }}</button>
            <strong>{{ weekLabel }}</strong>
            <button class="btn btn-outline-secondary" type="button" :disabled="loading" @click="changeWeek(1)">{{ t('week.next') }}</button>
            <button class="btn btn-outline-secondary" type="button" :disabled="loading" @click="goToToday">{{ t('week.today') }}</button>
          </div>
          <span v-if="!loading && !errorKey" class="week-count">{{ t('week.count', { count: schedules.length }) }}</span>
        </div>

        <div class="week-filter" role="group" :aria-label="t('week.filterLabel')">
          <span>{{ t('week.filterLabel') }}:</span>
          <button class="btn btn-sm" :class="selectedPerson === '' ? 'btn-primary' : 'btn-outline-secondary'"
            type="button" :aria-pressed="selectedPerson === ''" :disabled="loading" @click="selectPerson('')">{{ t('week.all') }}</button>
          <button v-for="person in relatedPeople" :key="person" class="btn btn-sm"
            :class="selectedPerson === person ? 'btn-primary' : 'btn-outline-secondary'"
            type="button" :aria-pressed="selectedPerson === person" :disabled="loading" @click="selectPerson(person)">{{ personLabel(person) }}</button>
        </div>

        <p v-if="loading" class="alert alert-light" role="status">{{ t('week.loading') }}</p>
        <div v-else-if="errorKey" class="alert alert-warning" role="alert">
          {{ t(errorKey) }}
          <button class="btn btn-link btn-sm" type="button" @click="load">{{ t('common.retry') }}</button>
        </div>
        <template v-else>
          <p v-if="schedules.length === 0" class="week-empty-banner" role="status">{{ t('week.emptyWeek') }}</p>
          <div class="week-grid" :aria-label="weekLabel">
            <section v-for="(day, index) in days" :key="day" class="week-day" :class="{ 'week-day-today': day === todayInVietnam() }">
              <div class="week-day-heading">
                <span>{{ t(weekdayKeys[index]) }}</span>
                <strong>{{ day.slice(8) }}/{{ day.slice(5, 7) }}</strong>
                <small v-if="day === todayInVietnam()">{{ t('week.todayBadge') }}</small>
              </div>
              <div class="week-day-events">
                <article v-for="schedule in schedulesByDay.get(day) ?? []" :key="schedule.id"
                  class="week-event" :class="`week-event-${schedule.meeting_mode}`">
                  <button class="week-event-button" type="button" :disabled="loading" @click="openDetail(schedule.id)">
                    <time>{{ timeLabel(schedule) }}</time>
                    <strong class="week-event-title">{{ schedule.title }}</strong>
                    <span class="week-mode">{{ t(schedule.meeting_mode === 'online' ? 'week.online' : 'week.offline') }}</span>
                    <small>{{ personLabel(schedule.related_person) }}</small>
                  </button>
                </article>
                <p v-if="!(schedulesByDay.get(day)?.length)" class="week-day-empty">{{ t('week.emptyDay') }}</p>
              </div>
            </section>
          </div>
        </template>
        <p class="week-footer">{{ t('week.timezone') }}</p>
        </template>
      </main>
    </div>
  </div>
</template>

<style src="../styles/week.css"></style>
