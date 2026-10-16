import { afterEach, describe, expect, it, vi } from 'vitest'
import { downloadPhoto } from '../src/utils/image'
import { savePreparedPhoto } from '../src/utils/savePhoto'

vi.mock('../src/utils/image', () => ({ downloadPhoto: vi.fn() }))
const photo = new File(['jpeg'], 'jagorawi.jpg', { type: 'image/jpeg' })
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks() })

describe('saving a prepared photo', () => {
  it('opens the share sheet synchronously in the click turn, using the prepared file', async () => {
    let finish!: () => void
    const share = vi.fn(() => new Promise<void>((resolve) => { finish = resolve }))
    vi.stubGlobal('navigator', { share, canShare: () => true })
    const pending = savePreparedPhoto(photo)
    expect(share).toHaveBeenCalledWith({ files: [photo] })
    expect(downloadPhoto).not.toHaveBeenCalled()
    finish()
    expect(await pending).toBe('shared')
  })

  it.each([{}, { share: vi.fn(), canShare: () => false }, { share: vi.fn(), canShare: () => { throw new Error('blocked') } }])(
    'requests a download when file sharing is unavailable', async (navigator) => {
      vi.stubGlobal('navigator', navigator)
      expect(await savePreparedPhoto(photo)).toBe('download-requested')
      expect(downloadPhoto).toHaveBeenCalledWith(photo, photo.name, 60_000)
    },
  )

  it('closing the device menu never downloads an unwanted copy', async () => {
    vi.stubGlobal('navigator', { canShare: () => true, share: () => Promise.reject(new DOMException('cancel', 'AbortError')) })
    expect(await savePreparedPhoto(photo)).toBe('cancelled')
    expect(downloadPhoto).not.toHaveBeenCalled()
  })

  it('surfaces a blocked share so the user can explicitly choose the download fallback', async () => {
    const error = new DOMException('blocked', 'NotAllowedError')
    vi.stubGlobal('navigator', { canShare: () => true, share: () => Promise.reject(error) })
    await expect(savePreparedPhoto(photo)).rejects.toBe(error)
    expect(downloadPhoto).not.toHaveBeenCalled()
  })
})
