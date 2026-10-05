export function activityKey(name: string) {
  return name.trim().replace(/\s+/g, ' ').toLocaleLowerCase('id')
}

// Keep the most recent spelling while grouping case/spacing variants.
export function activityNames(visits: { activityName: string }[]) {
  const names = new Map<string, string>()
  for (const visit of visits) {
    const key = activityKey(visit.activityName)
    if (key && !names.has(key)) names.set(key, visit.activityName.trim().replace(/\s+/g, ' '))
  }
  return [...names.values()]
}

export function combinedPhotoNote(photo: { note: string; additionalNote?: string }) {
  return [photo.note, photo.additionalNote].filter((note) => note?.trim()).join('\n\n')
}
