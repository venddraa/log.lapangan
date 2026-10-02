export type LocationType =
  | 'toll_gate'
  | 'main_road'
  | 'gantry'
  | 'ro_office'
  | 'area_office'
  | 'other'

export type ActivityCategory =
  | 'Survey'
  | 'Observasi'
  | 'Inspeksi'
  | 'Maintenance'
  | 'Meeting'
  | 'Dokumentasi'
  | 'Lainnya'

export type VisitLocation = {
  type: LocationType
  typeLabel: string
  tollRoadId?: string
  tollRoadName?: string
  name: string
  detail?: string
  direction?: string
  station?: string
}

export type NewVisit = {
  activityName: string
  activityCategory?: ActivityCategory
  primaryLocation: VisitLocation
  notes: string
  visitDate: string
}

export type NewPhoto = {
  id?: string
  blob: Blob
  note: string
  additionalNote: string
}

export type CreateVisitInput = NewVisit & {
  photos: NewPhoto[]
}

export type Visit = NewVisit & {
  id: string
  createdAt: string
  updatedAt: string
}

export type Photo = Omit<NewPhoto, 'id'> & {
  id: string
  visitId: string
  createdAt: string
}

export type VisitSummary = Visit & {
  photoCount: number
}
