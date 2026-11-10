<script setup lang="ts">
import { ref } from 'vue'
import LoginView from './views/LoginView.vue'
import type { LoginResult } from './services/auth'

const session = ref<LoginResult | null>(null)

function onAuthenticated(result: LoginResult) {
  session.value = result
}
</script>

<template>
  <LoginView v-if="!session" @authenticated="onAuthenticated" />
  <main v-else class="container py-5">
    <h1 class="h3">Xin chào, {{ session.user.name }}</h1>
    <p class="text-secondary">Bạn đã đăng nhập thành công.</p>
  </main>
</template>
