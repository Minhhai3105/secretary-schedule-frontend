<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { AuthError, refreshSession, type LoginResult } from '../services/auth'
import {
  EmailAuditError, getEmailDelivery, listEmailDeliveries,
  type DeliveryKind, type DeliveryStatus, type EmailDeliveryDetail, type EmailDeliveryPage,
} from '../services/emailDeliveries'

const props = defineProps<{ session: LoginResult }>()
const emit = defineEmits<{
  openSchedule: [scheduleId: string]
  sessionUpdated: [session: LoginResult]
  sessionExpired: []
}>()
const { locale, t } = useI18n({ useScope: 'global' })
const statuses: DeliveryStatus[] = ['pending', 'sending', 'sent', 'failed', 'unknown', 'cancelled']
const kinds: DeliveryKind[] = ['daily', 'near', 'update']
const status = ref<DeliveryStatus | ''>('')
const kind = ref<DeliveryKind | ''>('')
const fromDate = ref('')
const toDate = ref('')
const page = ref(1)
const result = ref<EmailDeliveryPage | null>(null)
const failureReasons = ref<Record<string, string>>({})
const detail = ref<EmailDeliveryDetail | null>(null)
const selectedId = ref<string | null>(null)
const loading = ref(false)
const detailLoading = ref(false)
const errorKey = ref('')
const detailErrorKey = ref('')
let detailRequest = 0

function dateTimeLabel(value: string | null): string {
  if (!value) return t('emailAudit.notAvailable')
  return new Intl.DateTimeFormat(locale.value === 'vi' ? 'vi-VN' : 'en-US', {
    timeZone: 'Asia/Ho_Chi_Minh', dateStyle: 'medium', timeStyle: 'short',
  }).format(new Date(value))
}

function latestErrorMessage(item: EmailDeliveryDetail): string {
  for (let i = item.attempts.length - 1; i >= 0; i--) {
    const message = item.attempts[i]?.error_message?.trim()
    if (message) return message
  }
  return ''
}

async function load() {
  if (loading.value) return
  if (fromDate.value && toDate.value && toDate.value < fromDate.value) {
    errorKey.value = 'emailAudit.dateRangeError'
    return
  }
  loading.value = true
  errorKey.value = ''
  try {
    let activeToken = props.session.access_token
    let data: EmailDeliveryPage
    try {
      data = await listEmailDeliveries(activeToken, page.value, status.value, kind.value, fromDate.value, toDate.value)
    } catch (cause) {
      if (!(cause instanceof EmailAuditError) || cause.code !== 'unauthorized') throw cause
      const renewed = await refreshSession()
      if (!renewed) {
        emit('sessionExpired')
        return
      }
      emit('sessionUpdated', renewed)
      activeToken = renewed.access_token
      data = await listEmailDeliveries(activeToken, page.value, status.value, kind.value, fromDate.value, toDate.value)
    }
    const failedItems = data.deliveries.filter((item) => item.status === 'failed')
    const reasons: Record<string, string> = {}
    if (failedItems.length > 0) {
      const settled = await Promise.allSettled(
        failedItems.map((item) => getEmailDelivery(activeToken, item.id)),
      )
      settled.forEach((outcome, index) => {
        const failedItem = failedItems[index]
        if (failedItem && outcome.status === 'fulfilled') {
          const message = latestErrorMessage(outcome.value)
          if (message) reasons[failedItem.id] = message
        }
      })
    }
    failureReasons.value = reasons
    result.value = data
  } catch (cause) {
    if (cause instanceof EmailAuditError && cause.code === 'unauthorized') {
      emit('sessionExpired')
    } else if (cause instanceof EmailAuditError && cause.code === 'validation') {
      errorKey.value = 'emailAudit.dateRangeError'
    } else if ((cause instanceof EmailAuditError && cause.code === 'network')
      || (cause instanceof AuthError && cause.code === 'restoreNetwork')) {
      errorKey.value = 'emailAudit.networkError'
    } else {
      errorKey.value = 'emailAudit.loadError'
    }
  } finally {
    loading.value = false
  }
}

function applyFilters() {
  if (loading.value) return
  if (fromDate.value && toDate.value && toDate.value < fromDate.value) {
    errorKey.value = 'emailAudit.dateRangeError'
    return
  }
  page.value = 1
  void load()
}

function resetFilters() {
  if (loading.value) return
  fromDate.value = ''
  toDate.value = ''
  status.value = ''
  kind.value = ''
  page.value = 1
  void load()
}

function changePage(next: number) {
  if (loading.value || !result.value || next < 1 || next > result.value.paging.total_pages) return
  page.value = next
  void load()
}

async function openDetail(id: string) {
  const request = ++detailRequest
  selectedId.value = id
  detail.value = null
  detailErrorKey.value = ''
  detailLoading.value = true
  try {
    let data: EmailDeliveryDetail
    try {
      data = await getEmailDelivery(props.session.access_token, id)
    } catch (cause) {
      if (!(cause instanceof EmailAuditError) || cause.code !== 'unauthorized') throw cause
      const renewed = await refreshSession()
      if (!renewed) {
        if (request === detailRequest) emit('sessionExpired')
        return
      }
      emit('sessionUpdated', renewed)
      data = await getEmailDelivery(renewed.access_token, id)
    }
    if (request === detailRequest) detail.value = data
  } catch (cause) {
    if (request !== detailRequest) return
    if (cause instanceof EmailAuditError && cause.code === 'unauthorized') {
      emit('sessionExpired')
    } else if (cause instanceof EmailAuditError && cause.code === 'notFound') {
      detailErrorKey.value = 'emailAudit.notFound'
    } else if ((cause instanceof EmailAuditError && cause.code === 'network')
      || (cause instanceof AuthError && cause.code === 'restoreNetwork')) {
      detailErrorKey.value = 'emailAudit.networkError'
    } else {
      detailErrorKey.value = 'emailAudit.loadError'
    }
  } finally {
    if (request === detailRequest) detailLoading.value = false
  }
}

function closeDetail() {
  ++detailRequest
  selectedId.value = null
  detail.value = null
  detailLoading.value = false
  detailErrorKey.value = ''
}

onMounted(() => { void load() })
</script>

<template>
  <section class="col-12 col-xl-10 p-0">
    <header class="mb-4">
      <h1 class="h3 mb-1">{{ t('emailAudit.title') }}</h1>
      <p class="text-secondary mb-0">{{ t('emailAudit.subtitle') }}</p>
    </header>

    <template v-if="selectedId">
      <button class="btn btn-outline-secondary mb-3" type="button" @click="closeDetail">{{ t('emailAudit.back') }}</button>
      <p v-if="detailLoading" class="alert alert-light" role="status">{{ t('emailAudit.loadingDetail') }}</p>
      <div v-else-if="detailErrorKey" class="alert alert-warning" role="alert">
        {{ t(detailErrorKey) }}
        <button class="btn btn-link btn-sm" type="button" @click="openDetail(selectedId)">{{ t('common.retry') }}</button>
      </div>
      <div v-else-if="detail" class="card p-4">
        <div class="d-flex justify-content-between align-items-start gap-2 flex-wrap">
          <h2 class="h5 mb-0">{{ t(`emailAudit.kind.${detail.kind}`) }}</h2>
          <span class="badge" :class="detail.status === 'sent' ? 'text-bg-success' : detail.status === 'failed' ? 'text-bg-danger' : 'text-bg-secondary'">
            {{ t(`emailAudit.status.${detail.status}`) }}
          </span>
        </div>
        <dl class="row mt-3 mb-0">
          <dt class="col-sm-4">{{ t('emailAudit.dueAt') }}</dt><dd class="col-sm-8">{{ dateTimeLabel(detail.due_at_utc) }}</dd>
          <dt class="col-sm-4">{{ t('emailAudit.sentAt') }}</dt><dd class="col-sm-8">{{ dateTimeLabel(detail.sent_at_utc) }}</dd>
          <dt class="col-sm-4">{{ t('emailAudit.applicableDate') }}</dt><dd class="col-sm-8">{{ detail.applicable_date_vietnam || t('emailAudit.notAvailable') }}</dd>
          <dt class="col-sm-4">{{ t('emailAudit.scheduleId') }}</dt>
          <dd class="col-sm-8 d-flex align-items-center gap-2 flex-wrap text-break">
            <span>{{ detail.schedule_id || t('emailAudit.notAvailable') }}</span>
            <button v-if="detail.schedule_id" class="btn btn-outline-primary btn-sm" type="button"
              @click="emit('openSchedule', detail.schedule_id)">
              {{ t('emailAudit.openSchedule') }}
            </button>
          </dd>
        </dl>
        <h3 class="h6 mt-4">{{ t('emailAudit.attempts') }}</h3>
        <p v-if="detail.attempts.length === 0" class="text-secondary mb-0">{{ t('emailAudit.noAttempts') }}</p>
        <ol v-else class="list-group list-group-numbered">
          <li v-for="attempt in detail.attempts" :key="attempt.id" class="list-group-item">
            <strong>{{ t(`emailAudit.attemptStatus.${attempt.status}`) }}</strong>
            <span class="d-block text-secondary small">{{ dateTimeLabel(attempt.started_at_utc) }} → {{ dateTimeLabel(attempt.finished_at_utc) }}</span>
            <p v-if="attempt.error_message" class="mb-0 mt-1 text-break">{{ attempt.error_message }}</p>
          </li>
        </ol>
      </div>
    </template>

    <template v-else>
      <form class="row g-2 align-items-end mb-3" @submit.prevent="applyFilters">
        <div class="col-12 col-sm-auto">
          <label class="form-label" for="email-from">{{ t('emailAudit.fromLabel') }}</label>
          <input id="email-from" v-model="fromDate" class="form-control" type="date" :disabled="loading" @change="applyFilters" />
        </div>
        <div class="col-12 col-sm-auto">
          <label class="form-label" for="email-to">{{ t('emailAudit.toLabel') }}</label>
          <input id="email-to" v-model="toDate" class="form-control" type="date" :disabled="loading" @change="applyFilters" />
        </div>
        <div class="col-12 col-sm-auto">
          <label class="form-label" for="email-status">{{ t('emailAudit.statusLabel') }}</label>
          <select id="email-status" v-model="status" class="form-select" :disabled="loading" @change="applyFilters">
            <option value="">{{ t('emailAudit.all') }}</option>
            <option v-for="item in statuses" :key="item" :value="item">{{ t(`emailAudit.status.${item}`) }}</option>
          </select>
        </div>
        <div class="col-12 col-sm-auto">
          <label class="form-label" for="email-kind">{{ t('emailAudit.kindLabel') }}</label>
          <select id="email-kind" v-model="kind" class="form-select" :disabled="loading" @change="applyFilters">
            <option value="">{{ t('emailAudit.all') }}</option>
            <option v-for="item in kinds" :key="item" :value="item">{{ t(`emailAudit.kind.${item}`) }}</option>
          </select>
        </div>
        <div class="col-12 col-sm-auto d-flex gap-2">
          <button class="btn btn-primary" type="submit" :disabled="loading">{{ t('emailAudit.apply') }}</button>
          <button v-if="fromDate || toDate || status || kind" class="btn btn-outline-secondary" type="button"
            :disabled="loading" @click="resetFilters">{{ t('emailAudit.resetFilters') }}</button>
        </div>
      </form>
      <p v-if="loading" class="alert alert-light" role="status">{{ t('emailAudit.loading') }}</p>
      <div v-else-if="errorKey" class="alert alert-warning" role="alert">
        {{ t(errorKey) }}
        <button v-if="errorKey !== 'emailAudit.dateRangeError'" class="btn btn-link btn-sm" type="button" @click="load">{{ t('common.retry') }}</button>
      </div>
      <template v-else-if="result">
        <p class="small text-secondary">{{ t('emailAudit.total', { count: result.paging.total }) }}</p>
        <p v-if="result.deliveries.length === 0" class="alert alert-light" role="status">{{ t('emailAudit.empty') }}</p>
        <div v-else class="list-group">
          <article v-for="delivery in result.deliveries" :key="delivery.id"
            class="list-group-item p-3" :class="{ 'border-danger bg-danger-subtle': delivery.status === 'failed' }">
            <button type="button" class="btn btn-link p-0 text-start text-decoration-none text-reset w-100"
              @click="openDetail(delivery.id)">
              <span class="d-flex justify-content-between align-items-start gap-3 flex-wrap">
                <strong>{{ t(`emailAudit.kind.${delivery.kind}`) }}</strong>
                <span class="badge" :class="delivery.status === 'sent' ? 'text-bg-success' : delivery.status === 'failed' ? 'text-bg-danger' : 'text-bg-secondary'">
                  {{ t(`emailAudit.status.${delivery.status}`) }}
                </span>
              </span>
              <small class="d-block text-secondary mt-2">{{ t('emailAudit.dueAt') }}: {{ dateTimeLabel(delivery.due_at_utc) }}</small>
              <small v-if="delivery.sent_at_utc" class="d-block text-secondary mt-1">{{ t('emailAudit.sentAt') }}: {{ dateTimeLabel(delivery.sent_at_utc) }}</small>
              <p v-if="delivery.status === 'failed'" class="mb-0 mt-2 small text-danger fw-semibold text-break">
                {{ t('emailAudit.failureReason') }}: {{ failureReasons[delivery.id] || t('emailAudit.unknownReason') }}
              </p>
            </button>
            <div v-if="delivery.schedule_id" class="mt-2 pt-2 border-top d-flex align-items-center justify-content-between gap-2 flex-wrap">
              <small class="text-secondary text-break">{{ t('emailAudit.scheduleId') }}: {{ delivery.schedule_id }}</small>
              <button class="btn btn-outline-primary btn-sm" type="button" @click="emit('openSchedule', delivery.schedule_id)">
                {{ t('emailAudit.openSchedule') }}
              </button>
            </div>
          </article>
        </div>
        <nav v-if="result.paging.total_pages > 1" class="d-flex gap-3 align-items-center mt-3" :aria-label="t('emailAudit.pagination')">
          <button class="btn btn-outline-secondary btn-sm" type="button" :disabled="page <= 1" @click="changePage(page - 1)">{{ t('emailAudit.previous') }}</button>
          <span class="small">{{ t('emailAudit.page', { page: result.paging.page, total: result.paging.total_pages }) }}</span>
          <button class="btn btn-outline-secondary btn-sm" type="button" :disabled="page >= result.paging.total_pages" @click="changePage(page + 1)">{{ t('emailAudit.next') }}</button>
        </nav>
      </template>
    </template>
  </section>
</template>
