# ML Squad — Panduan Setup

Website ini sudah dibuat sebagai frontend + kode backend Supabase. File belum dipasang ke project atau hosting kamu secara otomatis. Ikuti langkah berikut.

## 1. Isi publishable/anon key
1. Buka Supabase Dashboard → project `itkrtfbxxoncfzgyixig`.
2. Masuk **Project Settings → API Keys** (atau API).
3. Salin **publishable key** atau `anon` key lama.
4. Buka `config.js`, ganti `PASTE_SUPABASE_PUBLISHABLE_OR_ANON_KEY_HERE`.
5. Jangan pernah menggunakan `service_role` key di `config.js`.

## 2. Buat tabel
1. Supabase → SQL Editor → New query.
2. Buka `supabase/schema.sql`, salin seluruh isinya, lalu jalankan.
3. Jika tabel sudah pernah dibuat dengan struktur berbeda, periksa sebelum menjalankan ulang agar tidak ada data yang hilang.

## 3. Deploy Edge Functions
Pasang Supabase CLI di komputer, login, lalu dari folder proyek jalankan:

```bash
supabase login
supabase link --project-ref itkrtfbxxoncfzgyixig
supabase functions deploy create-community-post
supabase functions deploy send-community-email
supabase functions deploy manage-community-post
```

Jika menggunakan dashboard web saja, buat tiga Edge Functions dengan nama persis seperti di atas dan salin kode dari folder `supabase/functions/` masing-masing.

## 4. Secrets Resend
Kamu sudah menambahkan API key. Pastikan nama secret tepat `RESEND_API_KEY` (bukan nama lain).
Tambahkan secret berikut di Edge Functions → Secrets:
- `RESEND_FROM_EMAIL` = alamat pengirim dari domain yang sudah diverifikasi di Resend, contoh `ML Squad <noreply@domainmu.com>` jika domainmu sudah verified.

Supabase biasanya menyediakan `SUPABASE_URL` dan `SUPABASE_SERVICE_ROLE_KEY` untuk Edge Functions. Pastikan keduanya tersedia sebagai environment secrets untuk function yang digunakan. Jangan pernah menyalin service role key ke frontend.

## 5. Email Resend
Email baru dikirim bila pengunjung memasukkan email dan mencentang persetujuan. Untuk mengirim dari domain sendiri, verifikasi domain di Resend terlebih dahulu. Alamat pengirim belum bisa dijamin berfungsi sebelum diverifikasi.

## 6. Aktifkan realtime (opsional)
Supabase → Database → Replication/Realtime, aktifkan `community_posts` untuk Postgres Changes. Jika belum diaktifkan, tombol refresh tetap bisa memuat ulang feed.

## 7. Penghapusan mingguan
1. Supabase → Database → Extensions, aktifkan `pg_cron`.
2. Jalankan blok `cron.schedule` yang dikomentari di bagian akhir `supabase/schema.sql`.
3. Catatan: ekspresi cron `0 3 */7 * *` mengikuti hari kalender tertentu setiap bulan dan bukan interval tepat 168 jam di semua bulan. Jika harus tepat setiap 7 hari, gunakan scheduler eksternal atau Supabase Cron dengan jadwal mingguan yang didukung dashboard. Fungsi cleanup tetap menghapus hanya postingan yang berusia lebih dari 7 hari dan mempertahankan dua postingan terbaru.

## 8. Jalankan website
Untuk uji cepat, buka `index.html` di browser setelah mengisi key. Untuk penggunaan sungguhan, hosting melalui Netlify, Vercel, GitHub Pages, atau hosting statis lain. Deploy folder frontend (`index.html`, `styles.css`, `app.js`, `config.js`) dan pastikan konfigurasi key sudah diisi.

## Catatan keamanan penting
- Kebijakan publik hanya memberi akses baca. Pembuatan dan pengelolaan postingan lewat Edge Functions.
- Tambahkan rate limiting / CAPTCHA sebelum mempublikasikan website secara luas.
- Untuk produksi, pertimbangkan memisahkan data email privat dari tabel publik, karena email tidak pernah boleh disertakan dalam query feed.
- Tombol selesai saat ini adalah tindakan komunitas dan bisa dipanggil publik. Jika perlu kontrol lebih ketat, wajibkan login atau verifikasi kepemilikan untuk tindakan tersebut.
- URL Saweria di `config.js` adalah placeholder umum. Ganti dengan URL akun Saweria milikmu.
