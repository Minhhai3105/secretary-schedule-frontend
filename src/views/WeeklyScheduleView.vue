<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { AuthError, refreshSession, type LoginResult } from '../services/auth'
import { cancelSchedule, getSchedule, listSchedules, ScheduleCancelError, ScheduleLoadError, type Schedule } from '../services/schedules'
import ScheduleDetailView from '../components/ScheduleDetailView.vue'
import CreateScheduleView from '../components/CreateScheduleView.vue'
import EditScheduleView from '../components/EditScheduleView.vue'
import HistoryView from '../components/HistoryView.vue'
import ReminderSettingsView from '../components/ReminderSettingsView.vue'
import EmailAuditView from '../components/EmailAuditView.vue'
import ChatView from '../components/ChatView.vue'
import LogoutConfirmModal from '../components/LogoutConfirmModal.vue'
import { mondayOf, shiftDate, todayInVietnam, vietnamDate, vietnamTime, weekDates } from '../utils/week'
import { isSelf, relatedPeopleOptions } from '../utils/relatedPerson'

type Section = 'week' | 'history' | 'reminders' | 'emails'

const props = defineProps<{ session: LoginResult; loggingOut: boolean; logoutError: string }>()
const emit = defineEmits<{
  sessionUpdated: [session: LoginResult]
  sessionExpired: []
  logoutRequested: []
}>()
const { locale, t } = useI18n({ useScope: 'global' })
const weekStart = ref(mondayOf(todayInVietnam()))
const activeSection = ref<Section>('week')
const remindersVisited = ref(false)
const sidebarCollapsed = ref(window.matchMedia('(max-width: 700px)').matches)
const selectedPerson = ref('')
const schedules = ref<Schedule[]>([])
const relatedPeople = ref<string[]>([])
const loading = ref(false)
const errorKey = ref('')
const creatingSchedule = ref(false)
const createInitialData = ref<Record<string, unknown> | null>(null)
const createdBanner = ref(false)
const editingSchedule = ref(false)
const editInitialOverrides = ref<Record<string, unknown> | null>(null)
const selectedScheduleId = ref<string | null>(null)
const selectedSchedule = ref<Schedule | null>(null)
const detailLoading = ref(false)
const detailErrorKey = ref('')
const cancellingSchedule = ref(false)
const cancelErrorKey = ref('')
const confirmingLogout = ref(false)
let detailRequest = 0
let handlingPopState = false
let restoreEditAfterLoad = false
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

function syncHistory(replace = false) {
  if (handlingPopState) return
  const state = {
    section: activeSection.value,
    scheduleId: selectedScheduleId.value,
    creating: creatingSchedule.value,
    editing: editingSchedule.value,
  }
  const hash = creatingSchedule.value
    ? '#create'
    : editingSchedule.value && selectedScheduleId.value
      ? `#edit/${selectedScheduleId.value}`
      : selectedScheduleId.value
        ? `#schedule/${selectedScheduleId.value}`
        : `#${activeSection.value}`
  if (replace) window.history.replaceState(state, '', hash)
  else if (window.location.hash !== hash) window.history.pushState(state, '', hash)
}

function personLabel(person: string): string {
  return isSelf(person) ? t('week.me') : person
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
    const selfFilter = selectedPerson.value === 'Me'
    const apiPerson = selfFilter ? '' : selectedPerson.value
    let result
    try {
      result = await listSchedules(props.session.access_token, from, to, apiPerson)
    } catch (cause) {
      if (!(cause instanceof ScheduleLoadError) || cause.code !== 'unauthorized') throw cause
      const renewed = await refreshSession()
      if (!renewed) {
        emit('sessionExpired')
        return
      }
      emit('sessionUpdated', renewed)
      result = await listSchedules(renewed.access_token, from, to, apiPerson)
    }
    schedules.value = selfFilter ? result.schedules.filter((item: Schedule) => isSelf(item.related_person)) : result.schedules
    relatedPeople.value = relatedPeopleOptions(result.related_people)
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
    if (request === detailRequest) {
      selectedSchedule.value = result
      if (restoreEditAfterLoad) {
        editingSchedule.value = result.status === 'upcoming'
        restoreEditAfterLoad = false
      }
    }
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

function openCreateForDate(day?: string) {
  createdBanner.value = false
  createInitialData.value = day ? { date: day } : null
  creatingSchedule.value = true
  syncHistory()
}

function showCreatedSchedule(schedule: Schedule) {
  weekStart.value = mondayOf(vietnamDate(schedule.starts_at_utc))
  selectedPerson.value = ''
  createInitialData.value = null
  creatingSchedule.value = false
  createdBanner.value = true
  openDetail(schedule.id)
  void load()
}

function openCreateFromChat(initialData: Record<string, unknown>) {
  createdBanner.value = false
  createInitialData.value = initialData
  creatingSchedule.value = true
  syncHistory()
}

function cancelCreateSchedule() {
  createInitialData.value = null
  creatingSchedule.value = false
  syncHistory()
}

function openDetail(id: string, restoreEditing = false) {
  selectedScheduleId.value = id
  editingSchedule.value = false
  restoreEditAfterLoad = restoreEditing
  syncHistory()
  void loadDetail()
}

function openEdit() {
  if (selectedSchedule.value?.status === 'upcoming') {
    createdBanner.value = false
    editInitialOverrides.value = null
    editingSchedule.value = true
    syncHistory()
  }
}

function openEditFromChat(schedule: Schedule, overrides: Record<string, unknown>) {
  createdBanner.value = false
  selectedScheduleId.value = schedule.id
  selectedSchedule.value = schedule
  editInitialOverrides.value = overrides
  editingSchedule.value = true
  syncHistory()
}

function cancelEditSchedule() {
  editInitialOverrides.value = null
  editingSchedule.value = false
  syncHistory()
}

function saveEditedSchedule(schedule: Schedule) {
  selectedSchedule.value = schedule
  editInitialOverrides.value = null
  editingSchedule.value = false
  weekStart.value = mondayOf(vietnamDate(schedule.starts_at_utc))
  selectedPerson.value = ''
  syncHistory()
  void load()
}

function reloadAfterEdit() {
  editInitialOverrides.value = null
  editingSchedule.value = false
  syncHistory()
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

function onChatScheduleChanged() {
  void load()
  if (selectedScheduleId.value && !creatingSchedule.value && !editingSchedule.value) {
    void loadDetail()
  }
}

function selectSection(section: Section) {
  if (activeSection.value === section && !selectedScheduleId.value && !creatingSchedule.value && !editingSchedule.value) return
  if (section === 'reminders') remindersVisited.value = true
  activeSection.value = section
  closeDetail()
}

function closeDetail() {
  createdBanner.value = false
  createInitialData.value = null
  editInitialOverrides.value = null
  creatingSchedule.value = false
  editingSchedule.value = false
  restoreEditAfterLoad = false
  ++detailRequest
  selectedScheduleId.value = null
  selectedSchedule.value = null
  detailLoading.value = false
  detailErrorKey.value = ''
  cancelErrorKey.value = ''
  syncHistory()
}

function onPopState(event: PopStateEvent) {
  handlingPopState = true
  try {
    const state = event.state
    const section = state?.section as Section | undefined
    if (section && ['week', 'history', 'reminders', 'emails'].includes(section)) {
      if (section === 'reminders') remindersVisited.value = true
      activeSection.value = section
    }
    const nextId = typeof state?.scheduleId === 'string' ? state.scheduleId : null
    const wantsEdit = Boolean(state?.editing)
    if (nextId !== selectedScheduleId.value) {
      if (nextId) openDetail(nextId, wantsEdit)
      else closeDetail()
    } else {
      editingSchedule.value = wantsEdit && selectedSchedule.value?.status === 'upcoming'
      restoreEditAfterLoad = wantsEdit && !selectedSchedule.value
    }
    creatingSchedule.value = Boolean(state?.creating)
  } finally {
    handlingPopState = false
  }
}

onMounted(() => {
  window.addEventListener('popstate', onPopState)
  syncHistory(true)
  void load()
})
onUnmounted(() => {
  window.removeEventListener('popstate', onPopState)
})
</script>

<template>
  <div class="week-shell" :class="{ 'week-shell-collapsed': sidebarCollapsed }">
    <aside class="week-sidebar">
      <div class="week-sidebar-header">
        <div class="week-brand">{{ t('intro.brand') }}<small>{{ t('week.privateSchedule') }}</small></div>
        <button class="week-sidebar-toggle" type="button"
          :aria-label="t(sidebarCollapsed ? 'week.expandSidebar' : 'week.collapseSidebar')"
          :title="t(sidebarCollapsed ? 'week.expandSidebar' : 'week.collapseSidebar')"
          @click="sidebarCollapsed = !sidebarCollapsed">
          <span aria-hidden="true">{{ sidebarCollapsed ? '›' : '‹' }}</span>
        </button>
      </div>
      <nav :aria-label="t('week.navigation')">
        <button class="week-nav-item" :class="{ 'week-nav-active': activeSection === 'week' }" type="button"
          :aria-current="activeSection === 'week' ? 'page' : undefined"
          :aria-label="sidebarCollapsed ? t('week.title') : undefined"
          :title="sidebarCollapsed ? t('week.title') : undefined"
          :disabled="creatingSchedule || editingSchedule || cancellingSchedule" @click="selectSection('week')">
          <span class="week-nav-icon" aria-hidden="true">▦</span><span class="week-nav-label">{{ t('week.title') }}</span>
        </button>
        <button class="week-nav-item" :class="{ 'week-nav-active': activeSection === 'history' }" type="button"
          :aria-current="activeSection === 'history' ? 'page' : undefined"
          :aria-label="sidebarCollapsed ? t('history.title') : undefined"
          :title="sidebarCollapsed ? t('history.title') : undefined"
          :disabled="creatingSchedule || editingSchedule || cancellingSchedule" @click="selectSection('history')">
          <svg class="week-nav-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"
            stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" />
          </svg>
          <span class="week-nav-label">{{ t('history.title') }}</span>
        </button>
        <button class="week-nav-item" :class="{ 'week-nav-active': activeSection === 'reminders' }" type="button"
          :aria-current="activeSection === 'reminders' ? 'page' : undefined"
          :aria-label="sidebarCollapsed ? t('reminders.title') : undefined"
          :title="sidebarCollapsed ? t('reminders.title') : undefined"
          :disabled="creatingSchedule || editingSchedule || cancellingSchedule" @click="selectSection('reminders')">
          <svg class="week-nav-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"
            stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" />
          </svg>
          <span class="week-nav-label">{{ t('reminders.title') }}</span>
        </button>
        <button class="week-nav-item" :class="{ 'week-nav-active': activeSection === 'emails' }" type="button"
          :aria-current="activeSection === 'emails' ? 'page' : undefined"
          :aria-label="sidebarCollapsed ? t('emailAudit.title') : undefined"
          :title="sidebarCollapsed ? t('emailAudit.title') : undefined"
          :disabled="creatingSchedule || editingSchedule || cancellingSchedule" @click="selectSection('emails')">
          <svg class="week-nav-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"
            stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" />
          </svg>
          <span class="week-nav-label">{{ t('emailAudit.title') }}</span>
        </button>
      </nav>
      <div class="week-sidebar-bottom">
        <p class="week-privacy">{{ t('week.privacy') }}</p>
        <div class="week-profile">
          <div class="week-avatar" aria-hidden="true">{{ props.session.user.name.trim().charAt(0).toUpperCase() }}</div>
          <div class="week-user"><strong>{{ props.session.user.name }}</strong><small>{{ props.session.user.email }}</small></div>
        </div>
        <button class="week-logout-button btn btn-outline-secondary btn-sm w-100" type="button"
          :aria-label="t(props.loggingOut ? 'session.loggingOut' : 'session.logout')"
          :title="sidebarCollapsed ? t(props.loggingOut ? 'session.loggingOut' : 'session.logout') : undefined"
          :disabled="props.loggingOut || loading" @click="confirmingLogout = true">
          <svg class="week-logout-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"
            stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M10 17l5-5-5-5M15 12H3M12 3h6a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-6" />
          </svg>
          <span class="week-logout-label">{{ t(props.loggingOut ? 'session.loggingOut' : 'session.logout') }}</span>
        </button>
      </div>
    </aside>

    <div class="week-area">
      <header class="week-topbar">
        <span>{{ t('week.personal') }} &nbsp;/&nbsp; <strong>{{ t(creatingSchedule ? 'create.title' : editingSchedule ? 'edit.title' : selectedScheduleId ? 'detail.title' : activeSection === 'history' ? 'history.title' : activeSection === 'reminders' ? 'reminders.title' : activeSection === 'emails' ? 'emailAudit.title' : 'week.title') }}</strong></span>
        <span>{{ t('week.timezone') }}</span>
      </header>
      <main class="week-content">
        <p v-if="props.logoutError" class="alert alert-danger" role="alert">{{ t(props.logoutError) }}</p>
        <p v-if="createdBanner" class="alert alert-success d-flex justify-content-between align-items-center" role="status">
          <span>{{ t('create.success') }} — {{ t('create.successHint') }}</span>
          <button class="btn-close" type="button" :aria-label="t('create.cancel')" @click="createdBanner = false" />
        </p>
        <CreateScheduleView v-if="creatingSchedule" :session="props.session" :related-people="relatedPeople"
          :initial-data="createInitialData" @cancel="cancelCreateSchedule" @created="showCreatedSchedule"
          @session-updated="emit('sessionUpdated', $event)" @session-expired="emit('sessionExpired')" />
        <EditScheduleView v-else-if="editingSchedule && selectedSchedule" :session="props.session"
          :schedule="selectedSchedule" :related-people="relatedPeople" :initial-overrides="editInitialOverrides"
          @cancel="cancelEditSchedule" @saved="saveEditedSchedule" @reload="reloadAfterEdit"
          @session-updated="emit('sessionUpdated', $event)" @session-expired="emit('sessionExpired')" />
        <ScheduleDetailView v-else-if="selectedScheduleId" :schedule="selectedSchedule" :loading="detailLoading"
          :error-key="detailErrorKey" :cancelling="cancellingSchedule" :cancel-error-key="cancelErrorKey"
          :back-key="activeSection === 'history' ? 'history.back' : activeSection === 'emails' ? 'emailAudit.back' : 'detail.back'"
          @back="closeDetail" @retry="loadDetail" @edit="openEdit" @cancel-confirmed="confirmCancel" />
        <HistoryView v-if="activeSection === 'history'" v-show="!selectedScheduleId" :session="props.session"
          @open-detail="openDetail" @session-updated="emit('sessionUpdated', $event)"
          @session-expired="emit('sessionExpired')" />
        <ReminderSettingsView v-if="remindersVisited" v-show="activeSection === 'reminders'" :session="props.session"
          @session-updated="emit('sessionUpdated', $event)" @session-expired="emit('sessionExpired')" />
        <EmailAuditView v-if="activeSection === 'emails'" v-show="!selectedScheduleId" :session="props.session"
          @open-schedule="openDetail" @session-updated="emit('sessionUpdated', $event)"
          @session-expired="emit('sessionExpired')" />
        <template v-if="activeSection === 'week' && !creatingSchedule && !selectedScheduleId">
          <div class="week-heading">
            <div><h1>{{ t('week.title') }}</h1><p>{{ t('week.subtitle') }}</p></div>
            <button class="btn btn-primary" type="button" :disabled="loading" @click="openCreateForDate()">{{ t('create.open') }}</button>
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
                  <button class="week-day-add" type="button" :disabled="loading"
                    :aria-label="`${t('week.addForDay')} ${day.slice(8)}/${day.slice(5, 7)}`"
                    :title="t('week.addForDay')" @click="openCreateForDate(day)">+</button>
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
                  <button v-if="!(schedulesByDay.get(day)?.length)" class="week-day-empty" type="button"
                    :disabled="loading" @click="openCreateForDate(day)">
                    {{ t('week.emptyDay') }} · + {{ t('create.open') }}
                  </button>
                </div>
              </section>
            </div>
          </template>
          <p class="week-footer">{{ t('week.timezone') }}</p>
        </template>
      </main>
    </div>

    <ChatView :session="props.session"
      @open-schedule="openDetail" @edit-create="openCreateFromChat" @edit-update="openEditFromChat"
      @session-updated="emit('sessionUpdated', $event)" @session-expired="emit('sessionExpired')"
      @schedule-changed="onChatScheduleChanged" />

    <LogoutConfirmModal :open="confirmingLogout" :logging-out="props.loggingOut"
      @close="confirmingLogout = false"
      @confirm="confirmingLogout = false; emit('logoutRequested')" />
  </div>
</template>

<style src="../styles/week.css"></style>
<style src="../styles/workspace.css"></style>
