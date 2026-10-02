import type { ActivityCategory, LocationType } from '../types/visit'

export const tollRoads = [
  { id: 'jagorawi', name: 'Jagorawi' },
  { id: 'dalam-kota', name: 'Dalam Kota' },
  { id: 'jakarta-tangerang', name: 'Jakarta–Tangerang' },
  { id: 'sedyatmo', name: 'Sedyatmo' },
  { id: 'jakarta-cikampek', name: 'Jakarta–Cikampek' },
  { id: 'cipularang', name: 'Cipularang' },
  { id: 'padaleunyi', name: 'Padaleunyi' },
] as const

export const locationTypes = [
  { id: 'toll_gate', label: 'Gerbang Tol', needsTollRoad: true },
  { id: 'main_road', label: 'Mainroad', needsTollRoad: true },
  { id: 'gantry', label: 'Gantry', needsTollRoad: true },
  { id: 'ro_office', label: 'Kantor RO', needsTollRoad: false },
  { id: 'area_office', label: 'Kantor Area', needsTollRoad: false },
  { id: 'other', label: 'Lokasi Lain', needsTollRoad: false },
] as const satisfies ReadonlyArray<{
  id: LocationType
  label: string
  needsTollRoad: boolean
}>

export const roadDirections = ['Jalur A', 'Jalur B', 'Dua arah'] as const

export const activityCategories = [
  'Survey',
  'Observasi',
  'Inspeksi',
  'Maintenance',
  'Meeting',
  'Dokumentasi',
  'Lainnya',
] as const satisfies ReadonlyArray<ActivityCategory>
