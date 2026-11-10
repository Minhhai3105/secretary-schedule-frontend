<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { AuthError, refreshSession, type LoginResult } from '../services/auth'
import { listSchedules, ScheduleLoadError, type Schedule } from '../services/schedules'
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
        <button class="btn btn-outline-secondary btn-sm w-100" type="button" :disabled="props.loggingOut || loading" @click="emit('logoutRequested')">
          {{ t(props.loggingOut ? 'session.loggingOut' : 'session.logout') }}
        </button>
      </div>
    </aside>

    <div class="week-area">
      <header class="week-topbar">
        <span>{{ t('week.personal') }} &nbsp;/&nbsp; <strong>{{ t('week.title') }}</strong></span>
        <span>{{ t('week.timezone') }}</span>
      </header>
      <main class="week-content">
        <div class="week-heading">
          <div><h1>{{ t('week.title') }}</h1><p>{{ t('week.subtitle') }}</p></div>
        </div>
        <p v-if="props.logoutError" class="alert alert-danger" role="alert">{{ t(props.logoutError) }}</p>

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
                  <time>{{ timeLabel(schedule) }}</time>
                  <h2>{{ schedule.title }}</h2>
                  <span class="week-mode">{{ t(schedule.meeting_mode === 'online' ? 'week.online' : 'week.offline') }}</span>
                  <small>{{ personLabel(schedule.related_person) }}</small>
                </article>
                <p v-if="!(schedulesByDay.get(day)?.length)" class="week-day-empty">{{ t('week.emptyDay') }}</p>
              </div>
            </section>
          </div>
        </template>
        <p class="week-footer">{{ t('week.timezone') }}</p>
      </main>
    </div>
  </div>
</template>

<style src="../styles/week.css"></style>
