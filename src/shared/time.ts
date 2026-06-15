import type { TimeSlot } from './types'

/** Map a Date to one of the labeled time slots. */
export function getTimeSlot(d: Date = new Date()): TimeSlot {
  const minutes = d.getHours() * 60 + d.getMinutes()
  if (minutes >= 4 * 60 && minutes < 6 * 60 + 30) return 'brahma-muhurta'
  if (minutes >= 6 * 60 + 30 && minutes < 9 * 60) return 'morning'
  if (minutes >= 9 * 60 && minutes < 18 * 60) return 'work'
  if (minutes >= 18 * 60 && minutes < 21 * 60) return 'evening'
  return 'night'
}

export function timeSlotLabel(slot: TimeSlot): string {
  switch (slot) {
    case 'brahma-muhurta':
      return 'Brahma Muhurta (early morning sadhana)'
    case 'morning':
      return 'morning (planning the day)'
    case 'work':
      return 'work hours'
    case 'evening':
      return 'evening (wind-down)'
    case 'night':
      return 'night (reflection)'
  }
}

/** YYYY-MM-DD in local time (used for the daily todo bucket). */
export function localDateKey(d: Date = new Date()): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n))
}
