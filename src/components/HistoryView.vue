<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { AuthError, refreshSession, type LoginResult } from '../services/auth'
import { listScheduleHistory, ScheduleLoadError, type HistoryType, type Schedule, type ScheduleHistoryPage } from '../services/schedules'
import { vietnamDate, vietnamTime } from '../utils/week'

const props = defineProps<{ session: LoginResult }>()
const emit = defineEmits<{
  openDetail: [id: string]
  sessionUpdated: [session: LoginResult]
  sessionExpired: []
}>()
const { locale, t } = useI18n({ useScope: 'global' })
const filters: HistoryType[] = ['all', 'past', 'cancelled']
const selectedType = ref<HistoryType>('all')
const queryInput = ref('')
const committedQuery = ref('')
const page = ref(1)
const result = ref<ScheduleHistoryPage | null>(null)
const loading = ref(false)
const errorKey = ref('')

function dateLabel(schedule: Schedule): string {
  const day = vietnamDate(schedule.starts_at_utc)
  return locale.value === 'vi'
    ? `${day.slice(8)}/${day.slice(5, 7)}/${day.slice(0, 4)}`
    : `${day.slice(5, 7)}/${day.slice(8)}/${day.slice(0, 4)}`
}

async function load() {
  if (loading.value) return
  loading.value = true
  errorKey.value = ''
  const type = selectedType.value
  const requestedPage = page.value
  const q = committedQuery.value
  try {
    let response: ScheduleHistoryPage
    try {
      response = await listScheduleHistory(props.session.access_token, type, requestedPage, q)
    } catch (cause) {
      if (!(cause instanceof ScheduleLoadError) || cause.code !== 'unauthorized') throw cause
      const renewed = await refreshSession()
      if (!renewed) {
        emit('sessionExpired')
        return
      }
      emit('sessionUpdated', renewed)
      response = await listScheduleHistory(renewed.access_token, type, requestedPage, q)
    }
    result.value = response
  } catch (cause) {
    if (cause instanceof ScheduleLoadError && cause.code === 'unauthorized') {
      emit('sessionExpired')
    } else if (cause instanceof ScheduleLoadError && cause.code === 'network') {
      errorKey.value = 'history.networkError'
    } else if (cause instanceof AuthError && cause.code === 'restoreNetwork') {
      errorKey.value = 'history.networkError'
    } else {
      errorKey.value = 'history.loadError'
    }
  } finally {
    loading.value = false
  }
}

function search() {
  if (loading.value) return
  committedQuery.value = queryInput.value.trim()
  page.value = 1
  void load()
}

function setType(type: HistoryType) {
  if (loading.value) return
  selectedType.value = type
  committedQuery.value = queryInput.value.trim()
  page.value = 1
  void load()
}

function changePage(nextPage: number) {
  if (loading.value || !result.value || nextPage < 1 || nextPage > result.value.paging.total_pages) return
  page.value = nextPage
  void load()
}

onMounted(() => { void load() })
</script>

<template>
  <section class="col-12 col-xl-10 p-0">
    <header class="mb-4">
      <h1 class="h3 mb-1">{{ t('history.title') }}</h1>
      <p class="text-secondary mb-0">{{ t('history.subtitle') }}</p>
    </header>

    <form class="row g-2 align-items-end mb-3" role="search" @submit.prevent="search">
      <div class="col-12 col-md-8">
        <label class="form-label" for="history-search">{{ t('history.searchLabel') }}</label>
        <input id="history-search" v-model="queryInput" class="form-control" maxlength="255"
          :placeholder="t('history.searchPlaceholder')" />
      </div>
      <div class="col-12 col-md-auto">
        <button class="btn btn-primary" type="submit" :disabled="loading">{{ t('history.search') }}</button>
      </div>
    </form>

    <div class="d-flex gap-2 flex-wrap mb-3" role="group" :aria-label="t('history.filterLabel')">
      <button v-for="type in filters" :key="type" class="btn btn-sm"
        :class="selectedType === type ? 'btn-primary' : 'btn-outline-secondary'"
        type="button" :aria-pressed="selectedType === type" :disabled="loading" @click="setType(type)">
        {{ t(`history.${type}`) }}
      </button>
    </div>

    <p v-if="loading" class="alert alert-light" role="status">{{ t('history.loading') }}</p>
    <div v-else-if="errorKey" class="alert alert-warning" role="alert">
      {{ t(errorKey) }}
      <button class="btn btn-link btn-sm" type="button" @click="load">{{ t('common.retry') }}</button>
    </div>
    <template v-else-if="result">
      <p class="text-secondary small">{{ result.paging.total === 1 ? t('history.oneResult') : t('history.total', { count: result.paging.total }) }}</p>
      <p v-if="result.schedules.length === 0" class="alert alert-light" role="status">{{ t('history.empty') }}</p>
      <div v-else class="list-group">
        <button v-for="schedule in result.schedules" :key="schedule.id" type="button"
          class="list-group-item list-group-item-action p-3" @click="emit('openDetail', schedule.id)">
          <span class="d-flex justify-content-between align-items-start gap-3 flex-wrap">
            <strong>{{ schedule.title }}</strong>
            <span class="badge" :class="schedule.status === 'cancelled' ? 'text-bg-danger' : 'text-bg-secondary'">
              {{ t(`history.${schedule.status}`) }}
            </span>
          </span>
          <small class="d-block text-secondary mt-2">
            {{ dateLabel(schedule) }} · {{ vietnamTime(schedule.starts_at_utc) }} ·
            {{ schedule.related_person === 'Tôi' ? t('week.me') : schedule.related_person }}
          </small>
        </button>
      </div>
      <nav v-if="result.paging.total_pages > 1" class="d-flex gap-3 align-items-center mt-3"
        :aria-label="t('history.pagination')">
        <button class="btn btn-outline-secondary btn-sm" type="button" :disabled="page <= 1" @click="changePage(page - 1)">
          {{ t('history.previous') }}
        </button>
        <span class="small">{{ t('history.page', { page: result.paging.page, total: result.paging.total_pages }) }}</span>
        <button class="btn btn-outline-secondary btn-sm" type="button" :disabled="page >= result.paging.total_pages" @click="changePage(page + 1)">
          {{ t('history.next') }}
        </button>
      </nav>
    </template>
  </section>
</template>
