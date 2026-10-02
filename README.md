# Field Log

Field Log adalah Progressive Web App untuk mencatat kegiatan lapangan jalan tol. Aplikasi dirancang mobile-first, dapat dipasang dari Safari ke Home Screen iPhone, dan tetap bisa digunakan tanpa koneksi setelah pernah dibuka.

## Fitur

- Pencatatan kunjungan berdasarkan jenis lokasi: gerbang tol, mainroad, gantry, Kantor RO, Kantor Area, atau lokasi lain.
- Nama kegiatan bebas dengan kategori opsional.
- Tanggal dan waktu kunjungan otomatis.
- Pengambilan foto dari kamera atau pemilihan beberapa foto dari galeri.
- Kompresi foto di perangkat sebelum disimpan.
- Catatan dan catatan tambahan untuk setiap foto.
- Riwayat dan detail kunjungan.
- Edit dan hapus kunjungan beserta foto.
- Penyimpanan lokal menggunakan IndexedDB.
- Manifest, ikon aplikasi, dan offline service worker.

## Stack

- React 19
- TypeScript
- Vite
- Dexie / IndexedDB
- vite-plugin-pwa / Workbox
- CSS tanpa UI framework

## Menjalankan project

Pastikan Node.js dan npm sudah tersedia, lalu jalankan:

```bash
npm install
npm run dev
```

Alamat development akan ditampilkan di terminal, biasanya `http://localhost:5173`.

## Build dan preview PWA

Service worker dibuat pada production build. Untuk mengujinya secara lokal:

```bash
npm run build
npm run preview -- --port 5173
```

Buka aplikasi sekali saat online, lalu gunakan mode Offline pada browser dan refresh halaman.

## Pemeriksaan kode

```bash
npm run lint
npm run build
```

## Penyimpanan dan privasi

Data kunjungan dan foto disimpan di IndexedDB pada perangkat pengguna. Field Log tidak memiliki backend, login, analytics, atau pengiriman data ke layanan pihak ketiga.

Data lokal tetap dapat hilang jika pengguna menghapus data situs atau sistem mengosongkan storage browser. Fitur export dan import backup direncanakan sebelum aplikasi digunakan untuk dokumentasi penting.

## Status

Versi saat ini mencakup form kunjungan, penyimpanan offline, foto, riwayat, detail, edit, hapus, dan konfigurasi PWA. Pengujian Safari iPhone dan deployment HTTPS menjadi tahap berikutnya.
