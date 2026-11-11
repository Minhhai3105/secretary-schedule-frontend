const vietnamTimeZone = 'Asia/Ho_Chi_Minh'

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10)
}

export function todayInVietnam(): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: vietnamTimeZone,
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date())
  const value = (type: string) => parts.find((part) => part.type === type)?.value
  return `${value('year')}-${value('month')}-${value('day')}`
}

export function shiftDate(iso: string, days: number): string {
  const date = new Date(`${iso}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return isoDate(date)
}

export function mondayOf(iso: string): string {
  const weekday = new Date(`${iso}T00:00:00Z`).getUTCDay()
  return shiftDate(iso, -(weekday === 0 ? 6 : weekday - 1))
}

export function weekDates(monday: string): string[] {
  return Array.from({ length: 7 }, (_, index) => shiftDate(monday, index))
}

export function vietnamDate(isoDateTime: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: vietnamTimeZone,
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date(isoDateTime))
  const value = (type: string) => parts.find((part) => part.type === type)?.value
  return `${value('year')}-${value('month')}-${value('day')}`
}

export function vietnamTime(isoDateTime: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: vietnamTimeZone,
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(new Date(isoDateTime))
}
