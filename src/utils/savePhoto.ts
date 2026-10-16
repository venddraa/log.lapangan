import { downloadPhoto } from './image'

export function canSharePhoto(file: File) {
  try { return typeof navigator.share === 'function' && Boolean(navigator.canShare?.({ files: [file] })) }
  catch { return false }
}

// Call directly from a click with an already prepared file. Awaiting canvas work
// first can lose the user activation required by mobile browsers.
export async function savePreparedPhoto(file: File) {
  if (!canSharePhoto(file)) {
    downloadPhoto(file, file.name, 60_000)
    return 'download-requested' as const
  }
  try {
    await navigator.share({ files: [file] })
    return 'shared' as const
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') return 'cancelled' as const
    throw error
  }
}
