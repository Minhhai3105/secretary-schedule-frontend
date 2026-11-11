<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { AuthError, refreshSession, type LoginResult } from '../services/auth'
import { getReminderSettings, putReminderSettings, ReminderError, type ReminderSettings } from '../services/reminders'

const props = defineProps<{ session: LoginResult }>()
const emit = defineEmits<{
  sessionUpdated: [session: LoginResult]
  sessionExpired: []
}>()
const { t } = useI18n({ useScope: 'global' })
const dailyEnabled = ref(false)
const dailyTime = ref('07:00')
const nearEnabled = ref(false)
const leadMinutes = ref<number | ''>(30)
const saved = ref<ReminderSettings | null>(null)
const loaded = ref(false)
const loading = ref(false)
const saving = ref(false)
const errorKey = ref('')
const savedNotice = ref(false)
const dirty = computed(() => saved.value !== null && (
  dailyEnabled.value !== saved.value.daily_enabled
  || dailyTime.value !== saved.value.daily_time.slice(0, 5)
  || nearEnabled.value !== saved.value.near_enabled
  || leadMinutes.value !== saved.value.lead_minutes
))

function applySettings(settings: ReminderSettings) {
  dailyEnabled.value = settings.daily_enabled
  dailyTime.value = settings.daily_time.slice(0, 5)
  nearEnabled.value = settings.near_enabled
  leadMinutes.value = settings.lead_minutes
  saved.value = settings
  loaded.value = true
}

async function load() {
  if (loading.value || saving.value) return
  loading.value = true
  errorKey.value = ''
  savedNotice.value = false
  try {
    let settings: ReminderSettings
    try {
      settings = await getReminderSettings(props.session.access_token)
    } catch (cause) {
      if (!(cause instanceof ReminderError) || cause.code !== 'unauthorized') throw cause
      const renewed = await refreshSession()
      if (!renewed) {
        emit('sessionExpired')
        return
      }
      emit('sessionUpdated', renewed)
      settings = await getReminderSettings(renewed.access_token)
    }
    applySettings(settings)
  } catch (cause) {
    if (cause instanceof ReminderError && cause.code === 'unauthorized') {
      emit('sessionExpired')
    } else if (cause instanceof ReminderError && cause.code === 'network') {
      errorKey.value = 'reminders.networkError'
    } else if (cause instanceof AuthError && cause.code === 'restoreNetwork') {
      errorKey.value = 'reminders.networkError'
    } else {
      errorKey.value = 'reminders.loadError'
    }
  } finally {
    loading.value = false
  }
}

async function save() {
  if (saving.value || loading.value || !dirty.value) return
  errorKey.value = ''
  savedNotice.value = false
  const time = dailyTime.value.trim()
  const minutes = Number(leadMinutes.value)
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time) || !Number.isInteger(minutes) || minutes < 1 || minutes > 10080) {
    errorKey.value = 'reminders.validationError'
    return
  }
  const payload: ReminderSettings = {
    daily_enabled: dailyEnabled.value,
    daily_time: time,
    near_enabled: nearEnabled.value,
    lead_minutes: minutes,
  }
  saving.value = true
  try {
    let settings: ReminderSettings
    try {
      settings = await putReminderSettings(props.session.access_token, payload)
    } catch (cause) {
      if (!(cause instanceof ReminderError) || cause.code !== 'unauthorized') throw cause
      const renewed = await refreshSession()
      if (!renewed) {
        emit('sessionExpired')
        return
      }
      emit('sessionUpdated', renewed)
      settings = await putReminderSettings(renewed.access_token, payload)
    }
    applySettings(settings)
    savedNotice.value = true
  } catch (cause) {
    if (cause instanceof ReminderError && cause.code === 'unauthorized') {
      emit('sessionExpired')
    } else if (cause instanceof ReminderError && cause.code === 'validation') {
      errorKey.value = 'reminders.validationError'
    } else if (cause instanceof ReminderError && cause.code === 'network') {
      errorKey.value = 'reminders.saveNetworkError'
    } else if (cause instanceof AuthError && cause.code === 'restoreNetwork') {
      errorKey.value = 'reminders.saveNetworkError'
    } else {
      errorKey.value = 'reminders.saveError'
    }
  } finally {
    saving.value = false
  }
}

onMounted(() => { void load() })
</script>

<template>
  <section class="workspace-page">
    <header class="workspace-header">
      <h1>{{ t('reminders.title') }}</h1>
      <p>{{ t('reminders.subtitle') }}</p>
    </header>
    <p class="alert alert-info" role="note">{{ t('reminders.notActive') }}</p>
    <p v-if="loading" class="alert alert-light" role="status">{{ t('reminders.loading') }}</p>
    <div v-if="errorKey" class="alert alert-warning" role="alert">
      {{ t(errorKey) }}
      <button v-if="!loaded" class="btn btn-link btn-sm" type="button" @click="load">{{ t('common.retry') }}</button>
    </div>
    <form v-if="loaded && !loading" class="workspace-card" novalidate @submit.prevent="save">
      <fieldset :disabled="saving">
        <div class="form-check form-switch mb-3">
          <input id="reminder-daily-enabled" v-model="dailyEnabled" class="form-check-input" type="checkbox" role="switch" @change="savedNotice = false" />
          <label class="form-check-label fw-semibold" for="reminder-daily-enabled">{{ t('reminders.dailyEnabled') }}</label>
          <div class="form-text">{{ t('reminders.dailyHint') }}</div>
        </div>
        <div class="mb-4 ms-4">
          <label class="form-label" for="reminder-daily-time">{{ t('reminders.dailyTime') }}</label>
          <input id="reminder-daily-time" v-model="dailyTime" class="form-control" type="time" required
            :disabled="!dailyEnabled || saving" @input="savedNotice = false" />
          <div class="form-text">{{ t('reminders.timezone') }}</div>
        </div>
        <hr />
        <div class="form-check form-switch mb-3">
          <input id="reminder-near-enabled" v-model="nearEnabled" class="form-check-input" type="checkbox" role="switch" @change="savedNotice = false" />
          <label class="form-check-label fw-semibold" for="reminder-near-enabled">{{ t('reminders.nearEnabled') }}</label>
          <div class="form-text">{{ t('reminders.nearHint') }}</div>
        </div>
        <div class="mb-4 ms-4">
          <label class="form-label" for="reminder-lead-minutes">{{ t('reminders.leadMinutes') }}</label>
          <input id="reminder-lead-minutes" v-model.number="leadMinutes" class="form-control" type="number"
            min="1" max="10080" step="1" required :disabled="!nearEnabled || saving" @input="savedNotice = false" />
          <div class="form-text">{{ t('reminders.leadRange') }}</div>
        </div>
        <p v-if="savedNotice" class="alert alert-success" role="status">{{ t('reminders.saved') }}</p>
        <p v-if="saving" class="alert alert-light" role="status">{{ t('reminders.saving') }}</p>
        <div class="d-flex gap-2 flex-wrap">
          <button class="btn btn-primary" type="submit" :disabled="!dirty || saving">{{ t('reminders.save') }}</button>
          <button class="btn btn-outline-secondary" type="button" :disabled="saving" @click="load">
            {{ t('reminders.reload') }}
          </button>
        </div>
      </fieldset>
    </form>
  </section>
</template>
