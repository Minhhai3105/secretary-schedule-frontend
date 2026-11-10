<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import PasswordField from '../components/PasswordField.vue'
import { login, LoginError, type LoginResult } from '../services/auth'

const { t } = useI18n({ useScope: 'global' })
const emit = defineEmits<{ authenticated: [result: LoginResult]; registerRequested: [] }>()
const email = ref('')
const password = ref('')
const error = ref('')
const loading = ref(false)

async function submit() {
  if (loading.value) return

  error.value = ''
  if (!email.value.trim() || !password.value) {
    error.value = 'login.required'
    return
  }

  loading.value = true
  try {
    emit('authenticated', await login(email.value.trim(), password.value))
  } catch (cause) {
    error.value = cause instanceof LoginError ? `errors.${cause.code}` : 'errors.loginFailed'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="login-layout">
    <aside class="login-intro">
      <div class="brand">{{ t('intro.brand') }}</div>
      <div class="intro-content">
        <h1>{{ t('intro.headline') }}</h1>
        <p>{{ t('intro.description') }}</p>
        <div class="benefits">
          <h2>{{ t('intro.benefitsTitle') }}</h2>
          <ul>
            <li>{{ t('intro.week') }}</li>
            <li>{{ t('intro.reminders') }}</li>
            <li>{{ t('intro.assistant') }}</li>
          </ul>
        </div>
      </div>
    </aside>

    <main class="login-main">
      <div class="login-form-wrap">
        <h2>{{ t('login.title') }}</h2>
        <p class="form-subtitle">{{ t('login.subtitle') }}</p>

        <form @submit.prevent="submit">
          <div class="mb-3">
            <label class="form-label" for="email">{{ t('common.email') }}</label>
            <input id="email" v-model="email" class="form-control" type="email"
              autocomplete="email" :placeholder="t('common.emailPlaceholder')" required :disabled="loading" />
          </div>
          <div class="mb-4">
            <PasswordField id="password" v-model="password" :label="t('common.password')"
              autocomplete="current-password" :disabled="loading" />
          </div>
          <button class="btn btn-primary w-100" type="submit" :disabled="loading">
            {{ t(loading ? 'login.submitting' : 'login.submit') }}
          </button>
          <p class="text-center mt-3 mb-0">{{ t('login.noAccount') }} <button class="btn btn-link p-0 align-baseline" type="button" @click="emit('registerRequested')">{{ t('login.register') }}</button></p>
          <p v-if="error" class="alert alert-danger mt-4" role="alert" aria-live="polite">{{ t(error) }}</p>
        </form>
      </div>
      <p class="timezone-note">{{ t('intro.timezone') }}</p>
    </main>
  </div>
</template>

<style src="../styles/login.css"></style>
