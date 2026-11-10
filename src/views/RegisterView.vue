<script setup lang="ts">
import { ref } from 'vue'
import { register, RegisterError } from '../services/auth'

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
    error.value = 'Vui lòng nhập đầy đủ thông tin.'
    return
  }
  if (password.value.length < 8 || password.value.length > 128) {
    error.value = 'Mật khẩu phải có từ 8 đến 128 ký tự.'
    return
  }
  if (password.value !== confirmPassword.value) {
    error.value = 'Mật khẩu nhập lại không khớp.'
    return
  }

  loading.value = true
  try {
    const user = await register({ name: name.value.trim(), email: email.value.trim(), password: password.value })
    completedEmail.value = user.email
    password.value = ''
    confirmPassword.value = ''
  } catch (cause) {
    error.value = cause instanceof RegisterError
      ? cause.message
      : 'Đăng ký chưa thành công. Vui lòng thử lại.'
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
        <template v-if="completedEmail">
          <h2>Tạo tài khoản thành công</h2>
          <p class="form-subtitle">Tài khoản {{ completedEmail }} đã sẵn sàng.</p>
          <button class="btn btn-primary" type="button" @click="emit('loginRequested')">Đến trang đăng nhập</button>
        </template>
        <template v-else>
          <h2>Tạo tài khoản</h2>
          <p class="form-subtitle register-subtitle">Email đăng ký cũng là địa chỉ nhận nhắc lịch.</p>
          <form @submit.prevent="submit">
            <div class="mb-3">
              <label class="form-label" for="register-name">Họ và tên</label>
              <input id="register-name" v-model="name" class="form-control" type="text" autocomplete="name"
                placeholder="Nhập họ và tên" maxlength="255" required :disabled="loading" />
            </div>
            <div class="mb-3">
              <label class="form-label" for="register-email">Email</label>
              <input id="register-email" v-model="email" class="form-control" type="email" autocomplete="email"
                placeholder="ban@example.com" maxlength="255" required :disabled="loading" />
            </div>
            <div class="mb-3">
              <label class="form-label" for="register-password">Mật khẩu</label>
              <input id="register-password" v-model="password" class="form-control" type="password"
                autocomplete="new-password" minlength="8" maxlength="128" required :disabled="loading" />
            </div>
            <div class="mb-4">
              <label class="form-label" for="register-confirm">Nhập lại mật khẩu</label>
              <input id="register-confirm" v-model="confirmPassword" class="form-control" type="password"
                autocomplete="new-password" required :disabled="loading" />
            </div>
            <button class="btn btn-primary w-100" type="submit" :disabled="loading">
              {{ loading ? 'Đang đăng ký…' : 'Đăng ký' }}
            </button>
            <p class="text-center mt-3 mb-0">Đã có tài khoản? <button class="btn btn-link p-0 align-baseline" type="button" @click="emit('loginRequested')">Đăng nhập</button></p>
            <p v-if="error" class="alert alert-danger mt-4" role="alert" aria-live="polite">{{ error }}</p>
          </form>
        </template>
      </div>
      <p class="timezone-note">Thời gian hiển thị theo múi giờ Việt Nam.</p>
    </main>
  </div>
</template>

<style src="../styles/login.css"></style>
<style scoped>
.register-subtitle { margin-bottom: 32px; }
</style>
