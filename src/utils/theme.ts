import { ref } from 'vue'

export type Theme = 'light' | 'dark'

const storageKey = 'secretary-schedule-theme'

function savedTheme(): Theme {
  try {
    return localStorage.getItem(storageKey) === 'dark' ? 'dark' : 'light'
  } catch {
    return 'light'
  }
}

export const theme = ref<Theme>(savedTheme())

export function applyTheme(value: Theme): void {
  document.documentElement.dataset.theme = value
  document.documentElement.dataset.bsTheme = value
}

export function setTheme(value: Theme): void {
  theme.value = value
  applyTheme(value)
  try {
    localStorage.setItem(storageKey, value)
  } catch {
    // Theme switch still works in-memory when storage is unavailable.
  }
}

export function toggleTheme(): void {
  setTheme(theme.value === 'dark' ? 'light' : 'dark')
}

applyTheme(theme.value)
