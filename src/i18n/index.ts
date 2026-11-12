import { createI18n } from 'vue-i18n'
import vi from './vi.json'
import en from './en.json'

export type Locale = 'vi' | 'en'

const storageKey = 'secretary-schedule-locale'

function savedLocale(): Locale {
  try {
    return localStorage.getItem(storageKey) === 'en' ? 'en' : 'vi'
  } catch {
    return 'vi'
  }
}

export const i18n = createI18n({
  legacy: false,
  locale: savedLocale(),
  fallbackLocale: 'vi',
  messages: { vi, en },
})

export function setLocale(locale: Locale): void {
  i18n.global.locale.value = locale
  document.documentElement.lang = locale
  try {
    localStorage.setItem(storageKey, locale)
  } catch {
    // The language switch still works when storage is unavailable.
  }
}
