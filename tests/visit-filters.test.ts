import { expect, test } from 'vitest'
import { emptyVisitFilters, filterVisits } from '../src/utils/visitFilters'
import type { VisitSummary } from '../src/types/visit'

function visit(id: string, date: string, road = 'jagorawi', gate = 'Ciawi 1'): VisitSummary {
  return {
    id, visitDate: date, createdAt: date, updatedAt: date, photoCount: 0,
    activityName: 'Survey RFID', notes: 'Tiang perlu diperiksa',
    primaryLocation: { type: 'toll_gate', typeLabel: 'Gerbang Tol', tollRoadId: road,
      tollRoadName: road === 'other' ? 'Ruas pribadi' : road, name: gate, detail: 'Gardu Multi 02' },
  }
}
const now = new Date('2026-10-05T02:00:00Z')
const ids = (items: VisitSummary[]) => items.map((item) => item.id)

test('today uses WIB midnight rather than UTC or device timezone', () => {
  const visits = [visit('before', '2026-10-04T16:59:59Z'), visit('start', '2026-10-04T17:00:00Z'),
    visit('end', '2026-10-05T16:59:59Z'), visit('after', '2026-10-05T17:00:00Z')]
  expect(ids(filterVisits(visits, { ...emptyVisitFilters, period: 'today' }, now))).toEqual(['start', 'end'])
})

test('last seven calendar days includes both boundaries and excludes future', () => {
  const visits = [visit('old', '2026-09-28T16:59:59Z'), visit('first', '2026-09-28T17:00:00Z'),
    visit('last', '2026-10-05T16:59:59Z'), visit('future', '2026-10-05T17:00:00Z')]
  expect(ids(filterVisits(visits, { ...emptyVisitFilters, period: 'week' }, now))).toEqual(['first', 'last'])
})

test('date range, road, gate and trimmed search combine without dropping an end-day visit', () => {
  const visits = [visit('match', '2026-10-05T16:59:59Z'), visit('road', '2026-10-05T12:00:00Z', 'jorr-e'),
    visit('gate', '2026-10-05T12:00:00Z', 'jagorawi', 'Ciawi 2'), visit('date', '2026-10-05T17:00:00Z')]
  const filters = { ...emptyVisitFilters, road: 'jagorawi', location: 'Ciawi 1',
    period: 'range' as const, start: '2026-10-05', end: '2026-10-05', query: '  MULTI 02  ' }
  expect(ids(filterVisits(visits, filters, now))).toEqual(['match'])
  expect(filterVisits(visits, { ...filters, start: '2026-10-06' }, now)).toEqual([])
})

test('manual roads stay searchable and distinct from known road IDs', () => {
  const visits = [visit('manual', '2026-10-05T02:00:00Z', 'other'), visit('known', '2026-10-05T02:00:00Z')]
  expect(ids(filterVisits(visits, { ...emptyVisitFilters, road: 'custom:Ruas pribadi' }, now))).toEqual(['manual'])
  expect(ids(filterVisits(visits, { ...emptyVisitFilters, query: 'perlu diperiksa' }, now))).toEqual(['manual', 'known'])
})
