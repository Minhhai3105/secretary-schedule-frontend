<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import PasswordField from '../components/PasswordField.vue'
import { register, RegisterError } from '../services/auth'
import { passwordError } from '../utils/password'

const { t } = useI18n({ useScope: 'global' })
const emit = defineEmits<{ loginRequested: [] }>()
const name = ref('')
const email = ref('')
const password = ref('')
const confirmPassword = ref('')
const error = ref('')
const completedEmail = ref('')
const loading = ref(false)

async function submit() {
  if (loading.value) return
  error.value = ''

  if (!name.value.trim() || !email.value.trim() || !password.value || !confirmPassword.value) {
    error.value = 'register.required'
    return
  }
  const invalidPassword = passwordError(password.value, confirmPassword.value)
  if (invalidPassword) {
    error.value = invalidPassword === 'length' ? 'register.passwordLength' : 'register.passwordMismatch'
    return
  }

  loading.value = true
  try {
    const user = await register({ name: name.value.trim(), email: email.value.trim(), password: password.value })
    completedEmail.value = user.email
    password.value = ''
    confirmPassword.value = ''
  } catch (cause) {
    error.value = cause instanceof RegisterError ? `errors.${cause.code}` : 'errors.registerFailed'
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
        <template v-if="completedEmail">
          <h2>{{ t('register.successTitle') }}</h2>
          <p class="form-subtitle">{{ t('register.successDescription', { email: completedEmail }) }}</p>
          <button class="btn btn-primary" type="button" @click="emit('loginRequested')">{{ t('register.goToLogin') }}</button>
        </template>
        <template v-else>
          <h2>{{ t('register.title') }}</h2>
          <p class="form-subtitle register-subtitle">{{ t('register.subtitle') }}</p>
          <form @submit.prevent="submit">
            <div class="mb-3">
              <label class="form-label" for="register-name">{{ t('register.name') }}</label>
              <input id="register-name" v-model="name" class="form-control" type="text" autocomplete="name"
                :placeholder="t('register.namePlaceholder')" maxlength="255" required :disabled="loading" />
            </div>
            <div class="mb-3">
              <label class="form-label" for="register-email">{{ t('common.email') }}</label>
              <input id="register-email" v-model="email" class="form-control" type="email" autocomplete="email"
                :placeholder="t('common.emailPlaceholder')" maxlength="255" required :disabled="loading" />
            </div>
            <div class="mb-3">
              <PasswordField id="register-password" v-model="password" :label="t('common.password')"
                autocomplete="new-password" :minlength="8" :maxlength="128" :disabled="loading" />
            </div>
            <div class="mb-4">
              <PasswordField id="register-confirm" v-model="confirmPassword" :label="t('register.confirmPassword')"
                autocomplete="new-password" :disabled="loading" />
            </div>
            <button class="btn btn-primary w-100" type="submit" :disabled="loading">
              {{ t(loading ? 'register.submitting' : 'register.submit') }}
            </button>
            <p class="text-center mt-3 mb-0">{{ t('register.hasAccount') }} <button class="btn btn-link p-0 align-baseline" type="button" @click="emit('loginRequested')">{{ t('register.login') }}</button></p>
            <p v-if="error" class="alert alert-danger mt-4" role="alert" aria-live="polite">{{ t(error) }}</p>
          </form>
        </template>
      </div>
      <p class="timezone-note">{{ t('intro.timezone') }}</p>
    </main>
  </div>
</template>

<style src="../styles/login.css"></style>
<style scoped>
.register-subtitle { margin-bottom: 32px; }
</style>
