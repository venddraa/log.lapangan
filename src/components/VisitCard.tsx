import type { VisitSummary } from '../types/visit'

type VisitCardProps = {
  visit: VisitSummary
  onOpen: (id: string) => void
}

export function VisitCard({ visit, onOpen }: VisitCardProps) {
  const visitDate = new Date(visit.visitDate)
  const location = [
    visit.primaryLocation.tollRoadName,
    visit.primaryLocation.name,
    visit.primaryLocation.detail,
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <button
      className="visit-card"
      type="button"
      onClick={() => onOpen(visit.id)}
    >
      <span className="visit-date">
        <span>
          {new Intl.DateTimeFormat('id-ID', { day: '2-digit' }).format(visitDate)}
        </span>
        <small>
          {new Intl.DateTimeFormat('id-ID', { month: 'short' }).format(visitDate)}
        </small>
      </span>
      <span className="visit-card-copy">
        <span className="visit-card-meta">
          <span>{visit.primaryLocation.typeLabel}</span>
          <span>
            {new Intl.DateTimeFormat('id-ID', {
              hour: '2-digit',
              minute: '2-digit',
            }).format(visitDate)}
          </span>
        </span>
        <strong>{visit.activityName}</strong>
        <span className="visit-location">{location}</span>
        <span className="visit-card-footer">
          {visit.activityCategory && <span>{visit.activityCategory}</span>}
          <span>{visit.photoCount} foto</span>
        </span>
      </span>
    </button>
  )
}
