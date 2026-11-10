<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import LanguageSwitch from './components/LanguageSwitch.vue'
import LoginView from './views/LoginView.vue'
import RegisterView from './views/RegisterView.vue'
import { AuthError, logout, refreshSession, type LoginResult } from './services/auth'

const { locale, t } = useI18n({ useScope: 'global' })
const session = ref<LoginResult | null>(null)
const authScreen = ref<'login' | 'register'>('login')
const restoring = ref(true)
const restoreError = ref('')
const logoutError = ref('')
const loggingOut = ref(false)

watch(locale, (value) => { document.documentElement.lang = value }, { immediate: true })

async function restore() {
  restoring.value = true
  restoreError.value = ''
  try {
    session.value = await refreshSession()
  } catch (cause) {
    restoreError.value = cause instanceof AuthError ? `errors.${cause.code}` : 'errors.restoreFailed'
  } finally {
    restoring.value = false
  }
}

function onAuthenticated(result: LoginResult) {
  session.value = result
  restoreError.value = ''
}

async function signOut() {
  if (loggingOut.value) return
  loggingOut.value = true
  logoutError.value = ''
  try {
    await logout()
    session.value = null
  } catch (cause) {
    logoutError.value = cause instanceof AuthError ? `errors.${cause.code}` : 'errors.logoutFailed'
  } finally {
    loggingOut.value = false
  }
}

onMounted(restore)
</script>

<template>
  <div class="language-switch-position"><LanguageSwitch /></div>
  <main v-if="restoring" class="container py-5" role="status" aria-live="polite">
    {{ t('session.restoring') }}
  </main>
  <main v-else-if="restoreError" class="container py-5">
    <p class="alert alert-warning" role="alert">{{ t(restoreError) }}</p>
    <button class="btn btn-primary" type="button" @click="restore">{{ t('common.retry') }}</button>
  </main>
  <template v-else-if="!session">
    <LoginView v-if="authScreen === 'login'" @authenticated="onAuthenticated" @register-requested="authScreen = 'register'" />
    <RegisterView v-else @login-requested="authScreen = 'login'" />
  </template>
  <main v-else class="container py-5">
    <div class="d-flex justify-content-between align-items-center gap-3">
      <div>
        <h1 class="h3">{{ t('session.greeting', { name: session.user.name }) }}</h1>
        <p class="text-secondary">{{ t('session.signedIn') }}</p>
      </div>
      <button class="btn btn-outline-primary" type="button" :disabled="loggingOut" @click="signOut">
        {{ t(loggingOut ? 'session.loggingOut' : 'session.logout') }}
      </button>
    </div>
    <p v-if="logoutError" class="alert alert-danger mt-3" role="alert">{{ t(logoutError) }}</p>
  </main>
</template>

<style scoped>
.language-switch-position { position: fixed; top: 16px; right: 24px; z-index: 10; }
</style>
