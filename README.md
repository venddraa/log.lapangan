# Log Lapangan

Log Lapangan adalah Progressive Web App untuk mencatat kegiatan lapangan jalan tol. Aplikasi dirancang mobile-first, dapat dipasang dari Safari ke Home Screen iPhone, dan tetap bisa digunakan tanpa koneksi setelah pernah dibuka.

## Fitur

- Pencatatan kunjungan berdasarkan jenis lokasi: gerbang tol, mainroad, gantry, Kantor RO, Kantor Area, atau lokasi lain.
- Nama kegiatan bebas dengan saran dari riwayat dan kategori opsional.
- Tanggal dan waktu kunjungan otomatis.
- Pengambilan foto dari kamera atau pemilihan beberapa foto dari galeri.
- Kompresi foto di perangkat sebelum disimpan.
- Satu catatan per foto, dapat diisi sebelum mengambil foto dan diedit sesudahnya.
- Tulisan lokasi, kegiatan, catatan, serta waktu otomatis pada hasil foto.
- Bagikan/simpan melalui share sheet dan unduh sebagai JPG.
- Riwayat dan detail kunjungan.
- Dropdown ruas dan gerbang yang bisa dicari, dengan pilihan isi manual dan ruas terakhir diingat di perangkat.
- Filter riwayat berdasarkan ruas, lokasi, nama kegiatan, waktu WIB, dan pencarian kegiatan/catatan/gardu/KM. Pilihan filter bertahan saat kembali dari detail.
- Edit dan hapus kunjungan beserta foto.
- Draft otomatis untuk kunjungan baru dan edit, termasuk foto, catatan per foto, dan catatan yang belum dipasangkan.
- Penyimpanan lokal menggunakan IndexedDB.
- Sinkronisasi antrean offline ke PostgreSQL dan private photo storage.
- Pencegahan konflik antarperangkat dan penyimpanan salinan lokal ketika bertabrakan.
- Manifest, ikon aplikasi, dan offline service worker.
- Layout desktop mulai lebar 1024 px: sidebar, konten lebar, filter sejajar, form dua kolom, dan galeri foto dua kolom. Layout mobile dipertahankan.

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
npm run test
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

Setelah akun dibuat, jalankan [supabase/field-log-sync.sql](supabase/field-log-sync.sql) di SQL Editor. SQL tambahan ini membuat fungsi transaksi metadata, nomor versi, penanda penghapusan, dan token retry. Tanpa fungsi ini, login tetap berfungsi tetapi sinkronisasi akan tertahan dan data lokal tetap dipertahankan.

Pada Vercel tambahkan kedua environment `VITE_SUPABASE_URL` dan `VITE_SUPABASE_PUBLISHABLE_KEY`, lalu redeploy. Production build tanpa konfigurasi akan menampilkan halaman setup dan tidak membuka dokumentasi.

Lima akun berbagi dokumentasi divisi. Sinkronisasi berjalan saat aplikasi dibuka, saat koneksi kembali, setelah perubahan lokal, serta setiap satu menit selama aplikasi aktif. Tombol **Sinkronkan** tersedia untuk menjalankan ulang. Edit yang bertabrakan ditahan; pilih **Simpan salinan lokal** untuk mempertahankan kedua versi atau **Gunakan versi cloud** untuk membuang edit lokal dengan konfirmasi.

Login pertama membutuhkan internet untuk memverifikasi allowlist. Pengguna yang sudah diverifikasi bisa membuka cache saat offline. Logout memerlukan antrean terkirim dahulu, lalu menghapus cache dokumentasi lokal. Cache browser tidak dienkripsi oleh aplikasi.

## Penyimpanan dan privasi

Data kunjungan dan foto disimpan secara lokal untuk penggunaan offline, kemudian dikirim ke project Supabase setelah login dan verifikasi membership. Metadata disimpan di PostgreSQL, foto di private bucket. RLS membatasi akses ke lima anggota terdaftar. Foto hasil unduhan bertulisan dibuat di perangkat; foto bersih yang disimpan di cloud.

Data lokal tetap dapat hilang jika pengguna menghapus data situs atau sistem mengosongkan storage browser. Fitur export dan import backup direncanakan sebelum aplikasi digunakan untuk dokumentasi penting.

## Draft otomatis

Perubahan form disimpan otomatis di IndexedDB, terpisah dari kunjungan dan antrean sinkronisasi. Status **Draft tersimpan di perangkat ini** berarti perubahan sudah selesai ditulis. Foto masuk draft setelah selesai diproses; tunggu proses dan status simpan selesai sebelum menutup aplikasi.

Draft muncul di beranda dengan tombol **Lanjutkan** dan **Buang**. Ada satu draft kunjungan baru per akun dan draft edit tersendiri untuk setiap kunjungan. Draft dipulihkan pada browser, domain, perangkat, dan akun yang sama; draft belum dikirim ke Supabase atau anggota lain. Jam kunjungan awal tetap dipertahankan saat dilanjutkan.

Saat kunjungan disimpan, draft dan file sementara dibersihkan dalam transaksi yang sama dengan penyimpanan kunjungan. Kegagalan simpan tetap mempertahankan draft. Dua tab tidak bisa menimpa revisi draft yang lebih baru. Jika kunjungan asal berubah atau sudah dihapus, draft edit dapat disimpan sebagai kunjungan baru dengan foto tersendiri.

Pembuangan draft memerlukan konfirmasi. Logout ditahan selama akun masih punya draft agar dokumentasi yang belum selesai tidak tertinggal tanpa disadari. Draft lokal bukan backup dan dapat hilang jika data situs dihapus. Penutupan paksa perangkat saat proses tulis/foto berlangsung tidak menjamin perubahan terakhir sudah tersimpan.

## Status

Versi saat ini mencakup form kunjungan, offline, foto bertulisan, login, antrean sinkronisasi, riwayat, detail, edit, hapus, dan PWA. Pengujian cloud mencakup antrean offline, akses foto privat, baca lintas akun, konflik dengan salinan lokal, serta penghapusan. Pengujian Safari iPhone tetap diperlukan sebelum penggunaan lapangan.

Pengujian cloud bersifat opt-in. Masukkan PIN sebagai environment `FIELD_LOG_TEST_PIN`, lalu jalankan `node --env-file=.env.local node_modules/vitest/vitest.mjs run tests/cloud-sync.live.test.ts`. Pengujian hanya membuat data sintetis dan membersihkan UUID yang dibuatnya.
