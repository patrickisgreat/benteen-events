type DateInput = string | Date | null | undefined

/** Parse an ISO timestamp string (or Date) to a Date. */
export function toDate(value: DateInput): Date | null {
  if (!value) return null
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

export function formatDate(value: DateInput, options: Intl.DateTimeFormatOptions = { dateStyle: 'long' }): string {
  const date = toDate(value)
  return date ? date.toLocaleDateString(undefined, options) : ''
}

/** Date + time (uses toLocaleString, which supports timeStyle — formatDate does not). */
export function formatDateTime(value: DateInput, options: Intl.DateTimeFormatOptions = { dateStyle: 'medium', timeStyle: 'short' }): string {
  const date = toDate(value)
  return date ? date.toLocaleString(undefined, options) : ''
}

export function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate()
  )
}

/** Format a Date as `YYYY-MM-DD` for an `<input type="date">`. */
export function toInputDate(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/** True when the event date is today or in the future. */
export function isUpcoming(value: DateInput): boolean {
  const date = toDate(value)
  if (!date) return false
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return date.getTime() >= today.getTime()
}
