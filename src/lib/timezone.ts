// Timezone utilities
// Format dates in user's timezone using profile settings

import { useProfileStore } from '@/stores/profileStore'

/**
 * Format a date/time in the specified timezone
 */
export function formatDateTime(
  date: string | Date,
  timezone: string,
  options?: Intl.DateTimeFormatOptions
): string {
  const d = typeof date === 'string' ? new Date(date) : date

  const defaultOptions: Intl.DateTimeFormatOptions = {
    timeZone: timezone,
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }

  return d.toLocaleString('en-US', { ...defaultOptions, ...options })
}

/**
 * Format just the date portion
 */
export function formatDate(
  date: string | Date,
  timezone: string,
  format: 'short' | 'medium' | 'long' = 'medium'
): string {
  const d = typeof date === 'string' ? new Date(date) : date

  const options: Intl.DateTimeFormatOptions = {
    timeZone: timezone,
  }

  switch (format) {
    case 'short':
      options.month = 'numeric'
      options.day = 'numeric'
      options.year = '2-digit'
      break
    case 'medium':
      options.month = 'short'
      options.day = 'numeric'
      options.year = 'numeric'
      break
    case 'long':
      options.weekday = 'long'
      options.month = 'long'
      options.day = 'numeric'
      options.year = 'numeric'
      break
  }

  return d.toLocaleDateString('en-US', options)
}

/**
 * Format just the time portion
 */
export function formatTime(
  date: string | Date,
  timezone: string,
  use24Hour: boolean = false
): string {
  const d = typeof date === 'string' ? new Date(date) : date

  return d.toLocaleTimeString('en-US', {
    timeZone: timezone,
    hour: 'numeric',
    minute: '2-digit',
    hour12: !use24Hour,
  })
}

/**
 * Format relative time (e.g., "2 hours ago", "in 3 days")
 */
export function formatRelativeTime(
  date: string | Date,
  _timezone?: string // Optional - relative time doesn't depend on timezone
): string {
  const d = typeof date === 'string' ? new Date(date) : date
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const diffSec = Math.floor(diffMs / 1000)
  const diffMin = Math.floor(diffSec / 60)
  const diffHour = Math.floor(diffMin / 60)
  const diffDay = Math.floor(diffHour / 24)
  const diffWeek = Math.floor(diffDay / 7)
  const diffMonth = Math.floor(diffDay / 30)
  const diffYear = Math.floor(diffDay / 365)

  // Future dates
  if (diffMs < 0) {
    const absDiffMin = Math.abs(diffMin)
    const absDiffHour = Math.abs(diffHour)
    const absDiffDay = Math.abs(diffDay)

    if (absDiffMin < 1) return 'in a moment'
    if (absDiffMin < 60) return `in ${absDiffMin}m`
    if (absDiffHour < 24) return `in ${absDiffHour}h`
    if (absDiffDay < 7) return `in ${absDiffDay}d`
    return `in ${Math.abs(diffWeek)}w`
  }

  // Past dates
  if (diffSec < 30) return 'just now'
  if (diffMin < 1) return `${diffSec}s ago`
  if (diffMin < 60) return `${diffMin}m ago`
  if (diffHour < 24) return `${diffHour}h ago`
  if (diffDay < 7) return `${diffDay}d ago`
  if (diffWeek < 4) return `${diffWeek}w ago`
  if (diffMonth < 12) return `${diffMonth}mo ago`
  return `${diffYear}y ago`
}

/**
 * Hook to get the current user's timezone
 * Falls back to browser timezone if not set
 */
export function useTimezone(): string {
  const profile = useProfileStore((state) => state.profile)
  return profile?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
}

/**
 * Hook to get timezone-aware formatting functions
 */
export function useTimezoneFunctions() {
  const timezone = useTimezone()

  return {
    timezone,
    formatDateTime: (date: string | Date, options?: Intl.DateTimeFormatOptions) =>
      formatDateTime(date, timezone, options),
    formatDate: (date: string | Date, format?: 'short' | 'medium' | 'long') =>
      formatDate(date, timezone, format),
    formatTime: (date: string | Date, use24Hour?: boolean) =>
      formatTime(date, timezone, use24Hour),
    formatRelativeTime: (date: string | Date) =>
      formatRelativeTime(date, timezone),
  }
}
