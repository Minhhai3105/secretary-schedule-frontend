export type DateLocale = 'vi' | 'en'

function formatDate(value: Date, locale: DateLocale, timeZone: string, withYear: boolean): string {
  return new Intl.DateTimeFormat(locale === 'vi' ? 'vi-VN' : 'en-US', {
    timeZone,
    day: '2-digit',
    month: '2-digit',
    ...(withYear ? { year: 'numeric' } : {}),
  }).format(value)
}

export function formatVietnamDate(isoDateTime: string, locale: DateLocale, withYear = true): string {
  return formatDate(new Date(isoDateTime), locale, 'Asia/Ho_Chi_Minh', withYear)
}

export function formatCalendarDate(date: string, locale: DateLocale, withYear = true): string {
  return formatDate(new Date(`${date}T00:00:00Z`), locale, 'UTC', withYear)
}
