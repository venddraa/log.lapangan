import type { ActivityCategory, LocationType } from '../types/visit'

export const tollRoads = [
  { id: 'jagorawi', name: 'Jagorawi' },
  { id: 'dalam-kota', name: 'Dalam Kota' },
  { id: 'jakarta-tangerang', name: 'Jakarta–Tangerang' },
  { id: 'sedyatmo', name: 'Sedyatmo' },
  { id: 'jakarta-cikampek', name: 'Jakarta–Cikampek' },
  { id: 'cipularang', name: 'Cipularang' },
  { id: 'padaleunyi', name: 'Padaleunyi' },
  { id: 'w2s', name: 'W2S' },
  { id: 'jorr-e', name: 'JORR E' },
  { id: 'csj', name: 'CSJ' },
  { id: 'jkc', name: 'JKC' },
  { id: 'mtn', name: 'MTN' },
  { id: 'bali-mandara', name: 'Bali Mandara' },
  { id: 'belmera', name: 'Belmera' },
  { id: 'mktt', name: 'MKTT' },
  { id: 'jsb', name: 'JSB' },
] as const

// Nama dan kelompok dari daftar operasional pengguna. Gardu tetap manual.
export const tollGates: Record<string, readonly string[]> = {
  w2s: ['Pondok Ranji'],
  'jorr-e': [
    'Jati Warna 2', 'Bambu Apus 2', 'Setu', 'Bambu Apus 1', 'Jati Asih 1',
    'Jati Asih 2', 'Bintara', 'Jati Warna 1', 'Cakung 2', 'Kalimalang 2',
    'Cikunir 2', 'Cakung 3 / Rorotan', 'Pulogebang', 'Cakung 1',
  ],
  jagorawi: [
    'Cimanggis 6', 'Citeureup 1', 'Ramp Dukuh 2', 'Sentul Selatan 2',
    'Ramp Cibubur 2', 'Bogor 1', 'Ramp Cibubur 1', 'Gunung Putri On Ramp',
    'Cimanggis 4', 'Cimanggis 2', 'Cimanggis Off Ramp', 'Cimanggis 3',
    'Karanggan Off Ramp', 'Bogor 2', 'Sentul Selatan 1', 'Ramp Taman Mini 2',
    'Taman Mini 1', 'Sentul 2', 'Sentul 1', 'Ciawi 1', 'Gunung Putri Off Ramp',
    'Citeureup 2', 'Ciawi 2',
  ],
  'jakarta-tangerang': [
    'Karawaci 4', 'Karawaci 3', 'Bitung 1', 'Karawaci 1', 'Kebon Jeruk Ramp 1',
    'Tangerang 2', 'Karang Tengah Barat 1', 'Kunciran 2', 'Kunciran 1',
    'Kebon Jeruk Ramp 2', 'Tangerang 1', 'Karang Tengah Barat 2',
  ],
  'dalam-kota': ['Halim', 'Cililitan', 'Tomang'],
  sedyatmo: ['Cengkareng', 'Kapuk', 'Kamal 1'],
  csj: ['Pamulang', 'Serpong 6', 'Serpong 7', 'Serpong 5'],
  jkc: [
    'Benda Utama 1', 'Kunciran 8', 'Benda Utama 4', 'Tanah Tinggi 2',
    'Benda Utama 2', 'Buaran Indah 1', 'Buaran Indah 2', 'Kunciran 6',
    'Kunciran 7', 'Tanah Tinggi 1', 'Benda Utama 3', 'Pinang 1', 'Pinang 2',
    'Pinang 3', 'Pinang 4',
  ],
  mtn: ['Kunciran 5', 'Kunciran 4', 'Serpong 2', 'Serpong 3', 'Parigi',
    'Kunciran 3', 'Serpong 1', 'Jelupang', 'Serpong 4'],
  cipularang: ['Kalihurip Utama 3', 'Sadang', 'Kalihurip Utama 1 & 5',
    'Kalihurip Utama 2 & 6', 'Padalarang Timur', 'Kalihurip Utama 4'],
  padaleunyi: ['Pasteur 1', 'Buah Batu', 'Baros 1 & 2', 'Pasir Koja',
    'Cileunyi', 'Moh. Toha', 'Kopo'],
  'bali-mandara': ['Benoa', 'Nusa Dua'],
  belmera: ['Mabar', 'Belawan', 'Tanjung Morawa', 'Tanjung Mulia',
    'Bandar Selamat 2', 'Bandar Selamat 4', 'H. Anif 1', 'H. Anif 2', 'Amplas'],
  mktt: ['Kualanamu', 'Kemiri', 'Lubuk Pakam', 'Perbaungan', 'Teluk Mengkudu', 'Sei Rampah'],
  jsb: ['Weleri', 'Kalikangkung', 'Kandeman', 'Kaliwungu', 'Kit Batang', 'Kendal'],
}

export function getRoadLabel(id: string) {
  const road = tollRoads.find((item) => item.id === id)
  if (id === 'jakarta-tangerang') return 'Janger · Jakarta–Tangerang'
  if (id === 'dalam-kota') return 'Dalkot · Dalam Kota'
  if (id === 'sedyatmo') return 'Sediyatmo / Sedyatmo'
  return road?.name ?? id
}

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
