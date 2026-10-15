import type { ActivityCategory, LocationType } from './visit'

export type DraftPhoto = { id: string; blob: Blob; note: string }
export type DraftFields = {
  startedAt: string
  locationType: LocationType
  tollRoadId: string
  customTollRoad: string
  locationName: string
  locationDetail: string
  gateChoice: string
  direction: string
  station: string
  activityName: string
  activityCategory: ActivityCategory | ''
  pendingNote: string
  photos: DraftPhoto[]
}
export type DraftRecord = {
  id: string
  owner: string
  visitId?: string
  baseUpdatedAt?: string
  newVisitId: string
  revision: number
  updatedAt: string
  fields: Omit<DraftFields, 'photos'> & { photos: Omit<DraftPhoto, 'blob'>[] }
}
export type LoadedDraft = Omit<DraftRecord, 'fields'> & { fields: DraftFields }
export type DraftCommit = { id: string; revision: number; newVisitId: string; baseUpdatedAt?: string }
