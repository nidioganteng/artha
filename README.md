# Artha

Aplikasi pencatatan keuangan pribadi: pemasukan, pengeluaran, transaksi rutin bulanan, dan investasi DCA di banyak platform. Berjalan di browser dan bisa dipasang seperti aplikasi native di HP (PWA). Menyimpan data lokal terlebih dahulu dan menyinkronkan ke cloud saat internet tersedia.

## Fitur

- Catat pemasukan dan pengeluaran dengan kategori dan rekening
- Rutin bulanan: aturan berulang (gaji, tagihan, DCA) dengan checklist per bulan; mencentang otomatis membuat transaksi
- Investasi DCA:
  - Tambah aset (BTC, Emas, dll) dan platform (Floq, BRI, dll) sendiri
  - Catat setiap pembelian dengan jumlah dan total Rp; harga per unit dihitung otomatis
  - Rata-rata beli berbobot, modal, nilai sekarang, untung/rugi, ROI, CAGR, dan XIRR
  - Harga BTC live dari Indodax; harga emas diisi manual
- Offline-first: data disimpan di perangkat dan dikirim otomatis saat internet kembali
- Tema terang/gelap otomatis (ikut sistem), dapat disesuaikan; dua palet warna (Lime & Hutan, Sage & Greige)
- PWA: pasang di layar HP dari browser, jalankan tanpa tampilan browser

## Tangkapan Layar

(Segera hadir)

## Stack

| Lapisan | Teknologi |
|---------|-----------|
| Frontend | Vite, React 19, TypeScript (strict), Tailwind CSS v4 |
| Backend | Supabase (Auth + Postgres + Row Level Security) |
| Deploy | Vercel (frontend + Vercel Functions untuk harga live) |
| Animasi | motion/react dengan dukungan `prefers-reduced-motion` |
| Font | Plus Jakarta Sans Variable (UI), DM Mono (angka) |
| PWA | vite-plugin-pwa |

## Prasyarat

- Node.js 20 atau lebih baru
- Akun [Supabase](https://supabase.com) (gratis)
- Akun [Vercel](https://vercel.com) (gratis, untuk deploy)

## Instalasi Lokal

```bash
git clone https://github.com/nidio/artha.git
cd artha
npm install
```

### 1. Siapkan Supabase

1. Buat project baru di [supabase.com](https://supabase.com).
2. Buka **SQL Editor**, tempel seluruh isi `supabase/schema.sql`, lalu klik **Run**.
3. Buka **Project Settings > API**, salin **Project URL** dan **anon public key**.
4. Buka **Authentication > Providers > Email**. Untuk kemudahan awal, matikan **Confirm email** sehingga akun langsung aktif.

Saat akun baru dibuat, database otomatis mengisi data awal: rekening (Kas, BRI), kategori umum, platform (Floq, BRI), dan aset (BTC dengan harga live, Emas dengan harga manual).

### 2. Konfigurasi variabel lingkungan

```bash
cp .env.example .env.local
```

Isi `.env.local` dengan nilai dari Supabase:

```
VITE_SUPABASE_URL=https://xxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOi...
```

### 3. Jalankan

```bash
npm run dev
```

Buka [http://localhost:5173](http://localhost:5173), daftar akun, lalu mulai mencatat.

**Catatan:** Harga live BTC via `api/prices.ts` (Vercel Function) tidak aktif saat `npm run dev`. Aplikasi memakai harga terakhir tersimpan atau kosong. Untuk mencoba harga live secara lokal, jalankan `npx vercel dev`.

## Deploy ke Vercel

1. Push repo ke GitHub.
2. Buka [vercel.com/new](https://vercel.com/new), import repo (framework terdeteksi otomatis sebagai Vite).
3. Tambahkan Environment Variables: `VITE_SUPABASE_URL` dan `VITE_SUPABASE_ANON_KEY`.
4. Klik **Deploy**.
5. Setelah domain Vercel aktif, buka Supabase > **Authentication > URL Configuration**, tambahkan URL Vercel ke **Site URL** dan **Redirect URLs** (format: `https://nama-proyek.vercel.app`).
6. Opsional: matikan pendaftaran baru (Supabase > Authentication > Sign In / Providers > matikan **Allow new users to sign up**) agar aplikasi hanya bisa dimasuki kamu.

## Pasang di HP (PWA)

Buka alamat Vercel di Chrome HP, ketuk menu titik tiga (Android) atau ikon bagikan (iOS), pilih **Install app** atau **Add to Home Screen**. Ikon Artha muncul di layar utama dan terbuka tanpa tampilan browser. Update otomatis setiap kamu deploy.

## Perintah

| Perintah | Keterangan |
|----------|-----------|
| `npm run dev` | Dev server lokal |
| `npm run build` | Build produksi (tsc strict + Vite) |
| `npm run preview` | Preview build lokal |
| `npm run check` | Semua uji non-browser (calc, sync, contrast) |
| `npm run check:calc` | Uji kalkulasi investasi (21 kasus) |
| `npm run check:sync` | Uji logika antrean sinkron (38 kasus) |
| `npm run check:contrast` | Uji kontras WCAG AA (72 pasang) |
| `npm run check:layout` | Uji aturan layout shell + browser Playwright (47 kasus) |

## Struktur Folder

```
api/prices.ts           Vercel Function: harga live Indodax (GET /api/prices)
supabase/schema.sql     Definisi tabel, RLS, trigger data awal (idempotent)
src/lib/calc.ts         Fungsi murni: rata-rata beli, ROI, CAGR, XIRR
src/lib/store.tsx       Store lokal-dulu + antrean sinkron ke Supabase
src/lib/theme.tsx       ThemeProvider: mode (system/light/dark) dan palet (a/b)
src/lib/usePortfolio.ts Gabungan trade + harga pasar menjadi posisi per aset
src/lib/prices.ts       Fetch /api/prices + cache localStorage
src/lib/format.ts       Format Rupiah, tanggal lokal, parseNum
src/ui/                 Komponen bersama: Sheet, EmptyState, Field, SyncBadge, dll
src/pages/              Dashboard, Transactions, Investments, Recurring, Settings, Login
scripts/check-*.ts      Skrip uji otomatis (dijalankan via npm run check:*)
```

## Catatan Keamanan

- Row Level Security aktif di semua tabel: setiap baris hanya bisa dibaca dan diubah oleh pemiliknya.
- Kunci `anon public` Supabase aman untuk disimpan di variabel lingkungan frontend (bukan rahasia). Jangan pernah menggunakan `service_role` di kode klien.
- Jangan pernah commit `.env.local` ke repo.
- Hash routing (`#home`, `#tx`, dll) hanya memetakan ke nama tab yang sudah terdefinisi; nilai di luar daftar diabaikan.

## Uji Otomatis

```bash
npm run check:calc      # Kalkulasi investasi
npm run check:sync      # Logika sinkronisasi offline
npm run check:contrast  # Kontras WCAG AA
npm run check:layout    # Layout shell + browser (butuh Playwright)
```

## Roadmap

- [ ] Grafik tren portofolio (nilai dan modal dari waktu ke waktu)
- [ ] Budget per kategori dengan peringatan mendekati batas
- [ ] Edit transaksi dan catatan investasi
- [ ] Saldo per rekening dan transfer antar rekening
- [ ] Dukungan aset tambahan dengan harga live

## Lisensi

Hak cipta dimiliki penuh oleh penulis (Nidio). Kode dibagikan untuk dilihat dan dipelajari; tidak diizinkan dipakai ulang, didistribusikan, atau dijual tanpa izin tertulis.
