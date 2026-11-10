<script setup lang="ts">
import { onMounted, ref } from 'vue'
import LoginView from './views/LoginView.vue'
import { logout, refreshSession, type LoginResult } from './services/auth'

const session = ref<LoginResult | null>(null)
const restoring = ref(true)
const restoreError = ref('')
const logoutError = ref('')
const loggingOut = ref(false)

async function restore() {
  restoring.value = true
  restoreError.value = ''
  try {
    session.value = await refreshSession()
  } catch (cause) {
    restoreError.value = cause instanceof Error ? cause.message : 'Không thể khôi phục phiên.'
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
    logoutError.value = cause instanceof Error ? cause.message : 'Đăng xuất chưa thành công.'
  } finally {
    loggingOut.value = false
  }
}

onMounted(restore)
</script>

<template>
  <main v-if="restoring" class="container py-5" role="status" aria-live="polite">
    Đang khôi phục phiên đăng nhập…
  </main>
  <main v-else-if="restoreError" class="container py-5">
    <p class="alert alert-warning" role="alert">{{ restoreError }}</p>
    <button class="btn btn-primary" type="button" @click="restore">Thử lại</button>
  </main>
  <LoginView v-else-if="!session" @authenticated="onAuthenticated" />
  <main v-else class="container py-5">
    <div class="d-flex justify-content-between align-items-center gap-3">
      <div>
        <h1 class="h3">Xin chào, {{ session.user.name }}</h1>
        <p class="text-secondary">Bạn đã đăng nhập thành công.</p>
      </div>
      <button class="btn btn-outline-primary" type="button" :disabled="loggingOut" @click="signOut">
        {{ loggingOut ? 'Đang đăng xuất…' : 'Đăng xuất' }}
      </button>
    </div>
    <p v-if="logoutError" class="alert alert-danger mt-3" role="alert">{{ logoutError }}</p>
  </main>
</template>
