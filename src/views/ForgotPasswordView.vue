<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { PasswordResetError, requestPasswordReset } from '../services/auth'

const { t } = useI18n({ useScope: 'global' })
const email = ref('')
const loading = ref(false)
const sent = ref(false)
const errorKey = ref('')

async function submit() {
  if (loading.value) return
  errorKey.value = ''
  const address = email.value.trim()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address) || address.length > 255) {
    errorKey.value = 'forgot.invalidEmail'
    return
  }

  loading.value = true
  try {
    await requestPasswordReset(address)
    sent.value = true
  } catch (cause) {
    if (cause instanceof PasswordResetError && cause.code === 'unavailable') {
      errorKey.value = 'forgot.unavailable'
    } else if (cause instanceof PasswordResetError && cause.code === 'invalidEmail') {
      errorKey.value = 'forgot.invalidEmail'
    } else if (cause instanceof PasswordResetError && cause.code === 'network') {
      errorKey.value = 'forgot.networkError'
    } else {
      errorKey.value = 'forgot.sendError'
    }
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <main class="container min-vh-100 d-flex align-items-center justify-content-center py-5">
    <section class="card p-4 p-md-5 w-100" style="max-width: 520px">
      <h1 class="h3 mb-2">{{ t('forgot.title') }}</h1>
      <p class="text-secondary">{{ t('forgot.subtitle') }}</p>
      <p v-if="sent" class="alert alert-success" role="status">{{ t('forgot.sent') }}</p>
      <form v-else novalidate @submit.prevent="submit">
        <div class="mb-3">
          <label class="form-label" for="forgot-email">{{ t('common.email') }}</label>
          <input id="forgot-email" v-model="email" class="form-control" type="email" autocomplete="email"
            maxlength="255" :placeholder="t('common.emailPlaceholder')" :disabled="loading" required />
        </div>
        <button class="btn btn-primary w-100" type="submit" :disabled="loading">
          {{ t(loading ? 'forgot.sending' : 'forgot.submit') }}
        </button>
        <p v-if="errorKey" class="alert alert-warning mt-3 mb-0" role="alert">{{ t(errorKey) }}</p>
      </form>
      <a class="btn btn-link mt-3" href="/">{{ t('forgot.back') }}</a>
    </section>
  </main>
</template>
