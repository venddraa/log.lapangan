import type { VisitSummary } from '../types/visit'
import { activityKey } from './activityNames'

export type VisitFilters = {
  road: string
  location: string
  period: 'all' | 'today' | 'week' | 'month' | 'range'
  start: string
  end: string
  query: string
  activity: string
}

export const emptyVisitFilters: VisitFilters = {
  road: '', location: '', period: 'all', start: '', end: '', query: '', activity: '',
}

// Hari kalender WIB, konsisten dengan waktu yang tertulis di foto.
export function jakartaDate(value: string | Date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date(value))
  return ['year', 'month', 'day'].map((type) => parts.find((part) => part.type === type)?.value).join('-')
}

export function roadKey(visit: VisitSummary) {
  const location = visit.primaryLocation
  if (location.tollRoadId && location.tollRoadId !== 'other') return location.tollRoadId
  return location.tollRoadName ? `custom:${location.tollRoadName}` : ''
}

export function filterVisits(visits: VisitSummary[], filters: VisitFilters, now = new Date()) {
  const today = jakartaDate(now)
  const startOfWeek = new Date(`${today}T00:00:00+07:00`)
  startOfWeek.setUTCDate(startOfWeek.getUTCDate() - 6)
  const weekStart = jakartaDate(startOfWeek)
  const query = filters.query.trim().toLocaleLowerCase('id')
  return visits.filter((visit) => {
    if (filters.road && roadKey(visit) !== filters.road) return false
    if (filters.location && visit.primaryLocation.name !== filters.location) return false
    if (filters.activity && activityKey(visit.activityName) !== activityKey(filters.activity)) return false
    const day = jakartaDate(visit.visitDate)
    if (filters.period === 'today' && day !== today) return false
    if (filters.period === 'week' && (day < weekStart || day > today)) return false
    if (filters.period === 'month' && day.slice(0, 7) !== today.slice(0, 7)) return false
    if (filters.period === 'range') {
      if (filters.start && day < filters.start) return false
      if (filters.end && day > filters.end) return false
    }
    if (query) {
      const location = visit.primaryLocation
      const text = [visit.activityName, visit.activityCategory, visit.notes, location.typeLabel,
        location.tollRoadName, location.name, location.detail, location.direction, location.station]
        .filter(Boolean).join(' ').toLocaleLowerCase('id')
      if (!text.includes(query)) return false
    }
    return true
  })
}
