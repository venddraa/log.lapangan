import { expect, test } from 'vitest'
import { activityNames, combinedPhotoNote } from '../src/utils/activityNames'

test('suggestions use recent spelling and remove blank/case/spacing duplicates', () => {
  expect(activityNames(['Survey RFID', 'survey  rfid', ' ', 'Meeting area'].map((activityName) => ({ activityName }))))
    .toEqual(['Survey RFID', 'Meeting area'])
})

test('editing legacy photos preserves both notes in one field without empty separators', () => {
  expect(combinedPhotoNote({ note: 'Tiang', additionalNote: 'Jalur kabel' })).toBe('Tiang\n\nJalur kabel')
  expect(combinedPhotoNote({ note: '', additionalNote: 'Jalur kabel' })).toBe('Jalur kabel')
  expect(combinedPhotoNote({ note: 'Tiang' })).toBe('Tiang')
})
