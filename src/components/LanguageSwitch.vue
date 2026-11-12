<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { setLocale } from '../i18n'

const { locale, t } = useI18n({ useScope: 'global' })
</script>

<template>
  <button class="btn btn-outline-secondary btn-sm language-switch" type="button"
    role="switch" :aria-checked="locale === 'en'" :aria-label="t('language.switchTo')"
    @click="setLocale(locale === 'vi' ? 'en' : 'vi')">
    <span :class="{ active: locale === 'vi' }">VI</span>
    <span aria-hidden="true">/</span>
    <span :class="{ active: locale === 'en' }">EN</span>
  </button>
</template>

<style scoped>
.language-switch { white-space: nowrap; background: white; }
.language-switch span { padding: 0 2px; }
.language-switch .active { color: #245bd3; font-weight: 700; }
</style>
