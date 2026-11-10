<script setup lang="ts">
import { ref } from 'vue'
import PasswordField from '../components/PasswordField.vue'
import { login, LoginError, type LoginResult } from '../services/auth'

const emit = defineEmits<{ authenticated: [result: LoginResult]; registerRequested: [] }>()
const email = ref('')
const password = ref('')
const error = ref('')
const loading = ref(false)

async function submit() {
  if (loading.value) return

  error.value = ''
  if (!email.value.trim() || !password.value) {
    error.value = 'Vui lòng nhập email và mật khẩu.'
    return
  }

  loading.value = true
  try {
    emit('authenticated', await login(email.value.trim(), password.value))
  } catch (cause) {
    error.value = cause instanceof LoginError
      ? cause.message
      : 'Đăng nhập chưa thành công. Vui lòng thử lại.'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="login-layout">
    <aside class="login-intro">
      <div class="brand">Lịch trình</div>
      <div class="intro-content">
        <h1>Chủ động mỗi ngày.</h1>
        <p>Sắp xếp lịch cá nhân, chuẩn bị trước cuộc họp và nhận email nhắc đúng lúc.</p>
        <div class="benefits">
          <h2>Một nơi cho mọi lịch hẹn</h2>
          <ul>
            <li>Xem lịch cả tuần trong một màn hình</li>
            <li>Nhắc việc qua email</li>
            <li>Tạo lịch nhanh với trợ lý AI</li>
          </ul>
        </div>
      </div>
    </aside>

    <main class="login-main">
      <div class="login-form-wrap">
        <h2>Chào mừng trở lại</h2>
        <p class="form-subtitle">Đăng nhập để tiếp tục quản lý lịch của bạn.</p>

        <form @submit.prevent="submit">
          <div class="mb-3">
            <label class="form-label" for="email">Email</label>
            <input id="email" v-model="email" class="form-control" type="email"
              autocomplete="email" placeholder="ban@example.com" required :disabled="loading" />
          </div>
          <div class="mb-4">
            <PasswordField id="password" v-model="password" label="Mật khẩu"
              autocomplete="current-password" :disabled="loading" />
          </div>
          <button class="btn btn-primary w-100" type="submit" :disabled="loading">
            {{ loading ? 'Đang đăng nhập…' : 'Đăng nhập' }}
          </button>
          <p class="text-center mt-3 mb-0">Chưa có tài khoản? <button class="btn btn-link p-0 align-baseline" type="button" @click="emit('registerRequested')">Đăng ký</button></p>
          <p v-if="error" class="alert alert-danger mt-4" role="alert" aria-live="polite">{{ error }}</p>
        </form>
      </div>
      <p class="timezone-note">Thời gian hiển thị theo múi giờ Việt Nam.</p>
    </main>
  </div>
</template>

<style src="../styles/login.css"></style>
