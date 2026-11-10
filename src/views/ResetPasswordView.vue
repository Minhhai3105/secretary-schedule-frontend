<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import PasswordField from '../components/PasswordField.vue'
import { PasswordResetError, resetPassword } from '../services/auth'

const props = defineProps<{ token: string }>()
const { t } = useI18n({ useScope: 'global' })
const password = ref('')
const confirmPassword = ref('')
const loading = ref(false)
const completed = ref(false)
const invalidToken = ref(!props.token || props.token.length < 20)
const errorKey = ref('')

async function submit() {
  if (loading.value || invalidToken.value) return
  errorKey.value = ''
  if (password.value.length < 8 || password.value.length > 128) {
    errorKey.value = 'reset.passwordLength'
    return
  }
  if (password.value !== confirmPassword.value) {
    errorKey.value = 'reset.passwordMismatch'
    return
  }

  loading.value = true
  try {
    await resetPassword(props.token, password.value)
    password.value = ''
    confirmPassword.value = ''
    completed.value = true
  } catch (cause) {
    if (cause instanceof PasswordResetError && cause.code === 'invalidToken') {
      invalidToken.value = true
      password.value = ''
      confirmPassword.value = ''
      errorKey.value = 'reset.invalidToken'
    } else if (cause instanceof PasswordResetError && cause.code === 'network') {
      errorKey.value = 'reset.networkError'
    } else {
      errorKey.value = 'reset.saveError'
    }
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <main class="container min-vh-100 d-flex align-items-center justify-content-center py-5">
    <section class="card p-4 p-md-5 w-100" style="max-width: 520px">
      <h1 class="h3 mb-2">{{ t('reset.title') }}</h1>
      <p class="text-secondary">{{ t('reset.subtitle') }}</p>
      <p v-if="completed" class="alert alert-success" role="status">{{ t('reset.success') }}</p>
      <p v-else-if="invalidToken" class="alert alert-warning" role="alert">{{ t(errorKey || 'reset.missingToken') }}</p>
      <form v-else novalidate @submit.prevent="submit">
        <div class="mb-3">
          <PasswordField id="reset-password" v-model="password" :label="t('reset.newPassword')"
            autocomplete="new-password" :minlength="8" :maxlength="128" :disabled="loading" />
        </div>
        <div class="mb-3">
          <PasswordField id="reset-confirm" v-model="confirmPassword" :label="t('reset.confirmPassword')"
            autocomplete="new-password" :disabled="loading" />
        </div>
        <button class="btn btn-primary w-100" type="submit" :disabled="loading">
          {{ t(loading ? 'reset.saving' : 'reset.submit') }}
        </button>
        <p v-if="errorKey" class="alert alert-warning mt-3 mb-0" role="alert">{{ t(errorKey) }}</p>
      </form>
      <a v-if="invalidToken" class="btn btn-link mt-3" href="/forgot-password">{{ t('reset.requestNew') }}</a>
      <a class="btn btn-link mt-2" href="/">{{ t('reset.back') }}</a>
    </section>
  </main>
</template>
