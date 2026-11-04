# Artha

Aplikasi pencatatan keuangan pribadi: pemasukan, pengeluaran, transaksi rutin bulanan, dan investasi DCA di banyak platform. Awalnya dibuat untuk pemakaian pribadi; halaman login tetap ada karena bisa dibuka untuk pengguna lain nanti.

## Masalah yang diselesaikan

Pencatatan sebelumnya tersebar (buku, papan, notes) sehingga tidak konsisten, dan investasi (BTC di Floq, emas di BRI) harus dicek satu per satu di tiap aplikasi. Artha menyatukan semuanya dan menghitung rata-rata beli DCA, modal, hasil, keuntungan, ROI, CAGR, dan XIRR secara otomatis dengan harga pasar terbaru.

## Stack

- Vite + React 19 + TypeScript (strict), Tailwind CSS v4
- Supabase: Auth + Postgres dengan Row Level Security
- Deploy di Vercel (folder `api/` jadi serverless function)
- PWA lewat vite-plugin-pwa, supaya bisa dipasang di layar HP dan dipakai offline
- motion/react untuk animasi (LazyMotion + domAnimation, respects prefers-reduced-motion)
- Self-hosted fonts: Plus Jakarta Sans Variable (UI), DM Mono (angka)
- Tanpa library router, grafik, atau state management eksternal (sengaja ringan)

## Perintah

```bash
npm install
npm run dev          # dev server (api/prices tidak aktif, pakai `npx vercel dev` untuk harga live)
npm run build        # tsc --noEmit + vite build, harus selalu lolos
npm run check:calc   # uji kalkulasi investasi, harus selalu lolos
npm run check:sync   # uji logika antrean sinkron, harus selalu lolos
npm run check:contrast # uji kontras WCAG AA 72 pasang warna, harus selalu lolos
npm run check:layout # uji aturan layout shell (3 tingkat nav, portal, animasi, palet)
```

## Struktur

```
api/prices.ts            harga live Indodax (Vercel Function), tanpa API key
supabase/schema.sql      tabel, RLS, trigger data awal untuk user baru (idempotent)
src/lib/calc.ts          fungsi murni: rata-rata beli (moving average), ROI, CAGR, XIRR
src/lib/store.tsx        store lokal-dulu + antrean sinkron ke Supabase
src/lib/theme.tsx        ThemeProvider + useTheme: mode (system/light/dark), palet (a/b)
src/lib/useMode.ts       useMode(): baca/tulis mode akun (lengkap/investasi) dari profiles
src/lib/usePortfolio.ts  gabungan trade + harga pasar menjadi posisi per aset
src/lib/prices.ts        fetch /api/prices + cache localStorage
src/lib/format.ts        format Rupiah, tanggal lokal, parseNum (format angka Indonesia)
src/lib/amount.ts        formatShort: singkatan Jt/M/T untuk nominal panjang
src/ui/                  komponen bersama: Card, Button, Chip, Field, EmptyState,
                         Sheet (native <dialog>), Skeleton, AmountText, SyncBadge
src/pages/               Dashboard, Transactions, Investments, Recurring, Settings, Login
scripts/check-calc.ts    uji kalkulasi (jalankan lewat npm run check:calc)
scripts/check-sync.ts    uji logika antrean sinkron (npm run check:sync)
scripts/check-contrast.ts uji kontras WCAG AA 72 pasang warna (npm run check:contrast)
scripts/check-layout.ts  uji aturan layout shell: nav eksklusif, portal, transform, palet (npm run check:layout)
```

## Aturan kerja Git

- Kerja hanya di branch aktif. Jangan membuat branch baru, worktree, atau berpindah branch, dan jangan merge, rebase, atau reset kecuali diminta eksplisit. Commit kecil per revisi. Jangan git push kecuali diminta; jangan pernah force push.

## Aturan penting arsitektur

1. **Offline-first.** Semua perubahan lewat `save()` dan `remove()` dari `useStore()`. Jangan memanggil Supabase langsung dari halaman. Store menyimpan perubahan ke antrean lokal lalu mengirimnya saat online.
2. **ID dibuat di client** (`crypto.randomUUID()`), sinkron memakai upsert, jadi aman diulang dan tidak membuat data dobel.
3. **Setiap tabel punya `user_id`** dan RLS `user_id = auth.uid()`. Tabel baru wajib ikut pola ini (tambahkan ke daftar di `schema.sql`) dan didaftarkan di `TABLES` dan `NUMERIC` pada `store.tsx`. Tabel opsional (belum tentu ada sebelum migrasi) didaftarkan di `OPTIONAL_TABLES`.
4. **Logika hitung investasi hanya di `calc.ts`** sebagai fungsi murni tanpa dependensi. Setiap perubahan rumus harus disertai uji di `scripts/check-calc.ts`.
5. **Angka dari Supabase bisa berupa string.** Kolom `numeric` dinormalisasi lewat `NUMERIC` di `store.tsx`. Input angka dari user diparse dengan `parseNum()` (mendukung "1.500.000" dan "0,0025"). Kuantitas aset memakai `dotIsDecimal = true`.
6. **Tanggal memakai zona waktu lokal** (`todayISO()`), bukan `toISOString()`, karena pemakai di UTC+8.
7. **Harga aset:** `price_source = 'indodax'` ambil live lewat `/api/prices`, `'manual'` diisi user (contoh emas BRI, tidak ada API publik).
8. Aset yang masih punya trade tidak boleh dihapus (FK `on delete restrict`).
9. **Shell tiga tingkat (navigasi eksklusif per breakpoint):**
   - `< 768px`: tab bar bawah (`md:hidden`), tanpa sidebar/rail.
   - `768–1023px`: icon rail 72px di kiri (`hidden md:flex lg:hidden`), tanpa tab bar.
   - `≥ 1024px`: sidebar penuh 224px di kiri (`hidden lg:flex`), tanpa tab bar.
   Tidak boleh ada dua elemen navigasi terlihat bersamaan di breakpoint apa pun.
10. **Sheet/Modal wajib memakai `createPortal(content, document.body)`.** Ini mencegah ancestor dengan `transform` CSS (termasuk `translateY(0px)` sisa animasi motion/react) memutus `position: fixed`. Jangan render Sheet di dalam pohon React biasa tanpa portal.
11. **Animasi tab (`AnimatePresence`) tidak boleh memakai transform `y` atau `x`** di `initial`/`exit`. Properti transform apa pun pada pembungkus tab yang masih aktif akan merusak `position: fixed` semua Sheet di dalamnya. Gunakan transisi `opacity` saja.
12. **Z-index berurutan lewat token CSS** (didefinisikan di `src/index.css`):
    `--z-header:10` < `--z-nav:20` < `--z-backdrop:30` < `--z-sheet:40` < `--z-toast:50`.
    Gunakan token ini, jangan nilai angka mentah.
13. **ModeToggle hanya satu: di header**, terlihat di semua ukuran layar. Jangan duplikasi di sidebar atau tempat lain.
14. **Tab bar: jangan taruh `display` di inline style nav.** `display: grid` atau `display: flex` pada elemen nav yang punya `md:hidden` akan mengalahkan Tailwind dan membuat nav selalu terlihat. Taruh di div anak di dalam nav.
15. **Mode akun (lengkap/investasi):** Baca via `useMode()`. Mode mengubah tampilan saja, tidak menghapus data. `profiles` dan `contributors` ada di `OPTIONAL_TABLES` sehingga error tabel belum ada tidak menyebabkan crash. Formulir daftar melewatkan mode via `signUp({ options: { data: { mode } } })`.

## Sistem Tema

Token warna didefinisikan di `src/index.css` dengan 4 selektor CSS:
`:root[data-palette="a"][data-theme="light"]`, `...dark`, `...b...light`, `...b...dark`.
Semua warna diakses lewat `var(--token)`, tidak ada hex tertanam di komponen atau SVG.

Kunci localStorage: `artha:palette` (a/b), `artha:mode` (system/light/dark).
`src/lib/theme.tsx` menyediakan `ThemeProvider` dan `useTheme()`.
`index.html` punya skrip inline anti-kedip yang membaca localStorage sebelum React render.

Palet A: Lime & Hutan (hijau gelap + lime). Palet B: Sage & Greige (earth tone). **Default: Palet B.**
Pengguna yang sudah menyimpan pilihan di localStorage tetap menggunakan palet mereka; default hanya berlaku bila localStorage kosong.

## Gaya kode dan teks

- Semua teks antarmuka dalam Bahasa Indonesia. Jangan pakai tanda pisah panjang (em dash) di teks yang tampil ke user.
- Mobile-first, harus tetap nyaman di HP (target utama) dan desktop. Tombol dan input cukup besar untuk jempol (min 44px).
- Styling memakai kelas CSS primitif (`.card`, `.input`, `.btn`, `.btn-ghost`, `.label`, `.muted`, `.chip`, `.bento`) dari `src/index.css` dan inline style dengan token `var(--token)`. Tidak ada hex tertanam di JSX/TSX.
- Animasi memakai `motion/react` dengan `m.div` (bukan `motion.div`). Selalu cek `useReducedMotion()` dan matikan gerak bila hasilnya true.
- Jangan menambah dependensi baru tanpa alasan kuat. Tanyakan dulu.
- Jangan pernah commit `.env` atau `.env.local`.

## Status

UI overhaul (5 fase) + perbaikan 6 bug layout selesai. Fitur Mode Akun (lengkap/investasi) + Kontributor selesai di branch `feat-account-mode`. Build lolos, 35 uji kalkulasi lolos (termasuk contributorShares), 48 uji sinkron lolos (termasuk profiles/contributors), 72 uji kontras WCAG AA lolos, 253 uji layout lolos. **Belum pernah dijalankan end to end dengan project Supabase sungguhan**, jadi bug integrasi (auth, RLS, sinkron offline, PWA install) kemungkinan masih ada. Prioritas pertama adalah memverifikasi alur itu. Migrasi `supabase/migrations/20261104_account_mode.sql` harus dijalankan sebelum fitur ini aktif di produksi.

## Backlog (urutan kasar)

1. Uji alur lengkap dengan Supabase asli: daftar, login, catat transaksi, DCA, offline lalu online, install PWA di HP.
2. Grafik tren portofolio (nilai dan modal dari waktu ke waktu).
3. Budget per kategori dengan peringatan mendekati batas.
4. Edit transaksi dan catatan investasi (saat ini hanya tambah dan hapus).
5. Saldo per rekening dan transfer antar rekening.
6. Dukungan aset tambahan dengan harga live (misalnya kripto lain di Indodax).
7. Bungkus jadi .apk lewat PWABuilder atau Capacitor kalau memang dibutuhkan.
