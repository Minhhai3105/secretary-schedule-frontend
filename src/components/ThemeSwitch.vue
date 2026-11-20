<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { theme, toggleTheme } from '../utils/theme'

const { t } = useI18n({ useScope: 'global' })
</script>

<template>
  <button class="btn btn-outline-secondary btn-sm theme-switch" type="button"
    role="switch" :aria-checked="theme === 'dark'"
    :aria-label="t(theme === 'dark' ? 'theme.switchToLight' : 'theme.switchToDark')"
    :title="t(theme === 'dark' ? 'theme.switchToLight' : 'theme.switchToDark')"
    @click="toggleTheme">
    <svg v-if="theme === 'dark'" class="theme-switch-icon" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M21 12.79A9 9 0 1 1 11.21 3a7 7 0 0 0 9.79 9.79Z" />
    </svg>
    <svg v-else class="theme-switch-icon" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
    </svg>
    <span>{{ t(theme === 'dark' ? 'theme.dark' : 'theme.light') }}</span>
  </button>
</template>

<style scoped>
.theme-switch {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  white-space: nowrap;
  background: var(--bg-surface);
  border-color: var(--border-color);
  color: var(--text-main);
}
.theme-switch:hover {
  background: var(--bg-hover);
  border-color: var(--brand-border);
  color: var(--brand-primary);
}
.theme-switch-icon {
  width: 15px;
  height: 15px;
  color: var(--brand-primary);
}
</style>
