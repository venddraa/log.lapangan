# Field Log

Field Log adalah Progressive Web App untuk mencatat kegiatan lapangan jalan tol. Aplikasi dirancang mobile-first, dapat dipasang dari Safari ke Home Screen iPhone, dan tetap bisa digunakan tanpa koneksi setelah pernah dibuka.

## Fitur

- Pencatatan kunjungan berdasarkan jenis lokasi: gerbang tol, mainroad, gantry, Kantor RO, Kantor Area, atau lokasi lain.
- Nama kegiatan bebas dengan kategori opsional.
- Tanggal dan waktu kunjungan otomatis.
- Pengambilan foto dari kamera atau pemilihan beberapa foto dari galeri.
- Kompresi foto di perangkat sebelum disimpan.
- Catatan dan catatan tambahan untuk setiap foto.
- Tulisan lokasi, kegiatan, catatan, serta waktu otomatis pada hasil foto.
- Bagikan/simpan melalui share sheet dan unduh sebagai JPG.
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
- Supabase Auth SDK (aktif setelah environment dikonfigurasi)
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

## Login tim

Login Supabase akan aktif jika dua environment berikut tersedia:

```bash
cp .env.example .env.local
```

Isi `VITE_SUPABASE_URL` dan `VITE_SUPABASE_PUBLISHABLE_KEY` dari Supabase. Tanpa kedua nilai tersebut, aplikasi berjalan dalam mode lokal agar pengembangan tidak terkunci.

Jalankan isi [supabase/field-log-schema.sql](supabase/field-log-schema.sql) melalui SQL Editor Supabase untuk menyiapkan tabel, RLS, dan private bucket. Lima akun internal dapat dibuat dari terminal tanpa menyimpan PIN di repository. Aplikasi membentuk password backend yang memenuhi panjang minimum Supabase dari kombinasi kode anggota dan PIN empat digit:

```bash
SUPABASE_URL='https://PROJECT_REF.supabase.co' \
SUPABASE_SERVICE_ROLE_KEY='SECRET_KEY' \
FIELD_LOG_INITIAL_PIN='PIN_EMPAT_DIGIT' \
npm run setup:users
```

Service role key hanya dipakai dari terminal administrator. Jangan menambahkannya ke `.env`, Vercel, source code, atau GitHub.

## Penyimpanan dan privasi

Data kunjungan dan foto saat ini tetap disimpan di IndexedDB pada perangkat pengguna. Login melindungi akses aplikasi setelah Supabase dikonfigurasi. Skema PostgreSQL dan private storage sudah disiapkan; sinkronisasi data antarperangkat merupakan tahap berikutnya setelah project Supabase dihubungkan.

Data lokal tetap dapat hilang jika pengguna menghapus data situs atau sistem mengosongkan storage browser. Fitur export dan import backup direncanakan sebelum aplikasi digunakan untuk dokumentasi penting.

## Status

Versi saat ini mencakup form kunjungan, penyimpanan offline, foto, riwayat, detail, edit, hapus, dan konfigurasi PWA. Pengujian Safari iPhone dan deployment HTTPS menjadi tahap berikutnya.
