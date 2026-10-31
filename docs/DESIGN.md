# Artha — Sistem Desain

> Sumber kebenaran tunggal untuk semua keputusan visual Artha. Setiap komponen, warna, dan animasi mengacu ke sini. Jangan ubah nilai ini tanpa memperbarui dokumen ini.

---

## 1. Prinsip Desain

**Angka di depan.** Nominal keuangan mendominasi hirarki visual — angka besar, jelas, tidak ada yang menghalangi. Urutan: angka utama → label → metadata.

**Ketenangan membangun kepercayaan.** Tidak ada noise visual, gradien ramai, atau bayangan bertumpuk. Satu aksen yang dominan, selebihnya netral.

**Offline-first terasa cepat.** Perubahan langsung tampil (optimistic UI). Status sinkron hanya muncul sebagai badge kecil, tidak pernah memblokir konten.

**Mobile utama, desktop setara.** Tab bar bawah adalah navigasi primer. Sidebar desktop adalah variasi luas dari pola yang sama, bukan sebuah hierarki berbeda.

**Aksesibel secara default.** WCAG AA minimum di semua kombinasi palet × tema. Warna semantik selalu disertai ikon atau teks — tidak pernah bergantung warna saja.

---

## 2. Sistem Tema

Artha mendukung dua palet (A dan B) yang masing-masing memiliki mode terang dan gelap, sehingga ada 4 kombinasi aktif. Pengguna memilih palet dan mode secara independen.

### Atribut HTML

```html
<!-- Nilai: a | b -->
<html data-palette="a" data-theme="light">
```

`data-theme` diisi `"light"` atau `"dark"` — bukan `"system"`. Pilihan "Sistem" di UI adalah mode logika yang menerjemahkan `prefers-color-scheme` ke salah satu dari dua nilai ini, dan diperbarui langsung saat OS berubah.

### Selektor CSS

Semua token warna didefinisikan dalam 4 selektor berikut:

```css
:root[data-palette="a"][data-theme="light"]  { /* Palet A terang */ }
:root[data-palette="a"][data-theme="dark"]   { /* Palet A gelap  */ }
:root[data-palette="b"][data-theme="light"]  { /* Palet B terang */ }
:root[data-palette="b"][data-theme="dark"]   { /* Palet B gelap  */ }
```

Tidak ada `:root` global atau fallback — semua nilai wajib eksplisit di keempat selektor.

### Registrasi Tailwind v4

```css
@theme inline {
  --color-bg:          var(--bg);
  --color-surface:     var(--surface);
  --color-surface-2:   var(--surface-2);
  --color-text-1:      var(--text-1);
  --color-text-2:      var(--text-2);
  --color-text-3:      var(--text-3);
  --color-border:      var(--border);
  --color-border-input: var(--border-input);
  --color-accent:      var(--accent);
  --color-accent-fg:   var(--accent-fg);
  --color-primary:     var(--primary);
  --color-primary-fg:  var(--primary-fg);
  --color-income:      var(--income);
  --color-income-fg:   var(--income-fg);
  --color-expense:     var(--expense);
  --color-expense-fg:  var(--expense-fg);
  --color-warn:        var(--warn);
  --color-warn-fg:     var(--warn-fg);
  --color-invest:      var(--invest);
}
```

### Persistensi dan Inisialisasi

Dua kunci `localStorage`:

| Kunci | Nilai | Keterangan |
|---|---|---|
| `artha:palette` | `"a"` atau `"b"` | Palet yang dipilih user |
| `artha:mode` | `"system"`, `"light"`, atau `"dark"` | Mode yang dipilih user |

**Inline script di `index.html`** — wajib dijalankan sebelum React render untuk menghindari flash:

```html
<script>
  (function () {
    var p = localStorage.getItem('artha:palette') || 'a'
    var m = localStorage.getItem('artha:mode') || 'system'
    var t = m === 'system'
      ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
      : m
    document.documentElement.setAttribute('data-palette', p)
    document.documentElement.setAttribute('data-theme', t)
  })()
</script>
```

**Listener perubahan OS** (di komponen Settings atau shell):

```ts
const mq = window.matchMedia('(prefers-color-scheme: dark)')
mq.addEventListener('change', (e) => {
  if (localStorage.getItem('artha:mode') === 'system') {
    document.documentElement.setAttribute('data-theme', e.matches ? 'dark' : 'light')
  }
})
```

**`meta theme-color`** mengikuti `--bg`. Perbarui dengan `<meta name="theme-color">` saat tema berubah:

```ts
document.querySelector('meta[name="theme-color"]')
  ?.setAttribute('content', getComputedStyle(document.documentElement).getPropertyValue('--bg').trim())
```

### Aturan Tidak Ada Hex di Komponen

SVG inline, grafik, dan semua elemen yang dirender di JavaScript **WAJIB** menggunakan `var(--token)` atau `getComputedStyle` untuk membaca nilai warna — tidak boleh ada hex literal di JSX, TSX, atau string SVG `fill`/`stroke`. Ini memastikan semua tema teraplikasi tanpa kode per-tema di komponen.

### UI Pengaturan Tema

**Seksi "Tampilan" di halaman Pengaturan:**

1. **Pemilih mode** — tiga opsi sebagai pill radio: ☀ Terang · ◐ Sistem · ☽ Gelap.
2. **Pemilih palet** — dua kartu mini berdampingan, masing-masing menampilkan swatch warna primer dan aksen dengan nama palet. Kartu yang aktif mendapat border `2px solid var(--primary)`.

**Toggle cepat di shell header** (mobile dan desktop): ikon matahari/bulan/sistem yang memutar antara tiga opsi mode. Tidak ada pemilih palet di header — palet hanya di Pengaturan.

---

## 3. Arah Palet

Kedua palet aktif di aplikasi. Pengguna memilih satu dari Pengaturan. Nilai di luar seksi ini berlaku untuk keduanya.

---

### Palet A · Lime & Hutan

**Alasan:** Lime (`#84CC16`) memberi energi dan kesan modern seperti fintech generasi baru. Dipasangkan dengan forest green gelap (`#1A3A28`) sebagai tombol dan aksen, nuansa pertumbuhan yang grounded. Mode gelap memakai latar hutan sangat gelap dengan lime terang dan glow ringan pada elemen aktif. Cocok bila Artha ingin berasa ambisius dan modern.

#### A · Terang

| Token | Hex | Rasio kontras | Keterangan |
|---|---|---|---|
| `--bg` | `#F1F3EF` | — | Latar halaman, abu-putih undertone hijau |
| `--surface` | `#FFFFFF` | — | Kartu, sheet, modal |
| `--surface-2` | `#F6F8F4` | — | Input background, permukaan sekunder |
| `--text-1` | `#0E1E15` | 17.28:1 on surface | Teks utama |
| `--text-2` | `#3D5948` | 7.72:1 on surface | Teks sekunder, label |
| `--text-3` | `#4D7362` | 5.32:1 on surface | Teks redup, placeholder, metadata |
| `--border` | `#DDE8DE` | — | Separator dekoratif antar kartu (WCAG-exempt) |
| `--border-input` | `#6B8F7B` | 3.60:1 on surface | Batas elemen input/select |
| `--accent` | `#84CC16` | — | Lime — dekorasi, chip, indikator. JANGAN untuk teks |
| `--accent-fg` | `#1A3A28` | 6.33:1 on accent | Teks/ikon di atas aksen |
| `--primary` | `#1A3A28` | — | Tombol utama, sidebar aktif, hero card |
| `--primary-fg` | `#FFFFFF` | 12.50:1 on primary | Teks di atas primary |
| `--income` | `#15803D` | 5.02:1 on surface | Pemasukan, untung |
| `--income-fg` | `#FFFFFF` | 5.02:1 on income | Teks di atas chip income |
| `--expense` | `#DC2626` | 4.83:1 on surface | Pengeluaran, rugi |
| `--expense-fg` | `#FFFFFF` | 4.83:1 on expense | Teks di atas chip expense |
| `--warn` | `#B45309` | 5.02:1 on surface | Peringatan, pending |
| `--warn-fg` | `#FFFFFF` | 5.02:1 on warn | Teks di atas chip warn |
| `--invest` | `#2563EB` | 5.17:1 on surface | Nilai investasi (netral biru) |

#### A · Gelap

| Token | Hex | Rasio kontras | Keterangan |
|---|---|---|---|
| `--bg` | `#0B1910` | — | Latar hutan sangat gelap |
| `--surface` | `#132119` | — | Kartu |
| `--surface-2` | `#1B3024` | — | Elevated, dropdown |
| `--text-1` | `#EBF4EC` | 14.84:1 on surface | Teks utama |
| `--text-2` | `#8CB89A` | 7.49:1 on surface | Teks sekunder |
| `--text-3` | `#7AAD90` | 6.52:1 on surface | Teks redup |
| `--border` | `#1E3828` | — | Separator dekoratif (WCAG-exempt) |
| `--border-input` | `#5A9470` | 4.69:1 on surface | Batas input/select |
| `--accent` | `#A3E635` | — | Lime terang, bercahaya |
| `--accent-fg` | `#0B1910` | 12.00:1 on accent | Teks di atas aksen |
| `--primary` | `#A3E635` | — | Lime sebagai primary di dark mode |
| `--primary-fg` | `#0B1910` | 12.00:1 on primary | |
| `--income` | `#4ADE80` | 9.57:1 on surface | |
| `--income-fg` | `#052E16` | 8.55:1 on income | Gelap di atas lime terang |
| `--expense` | `#F87171` | 6.03:1 on surface | |
| `--expense-fg` | `#450A0A` | 5.84:1 on expense | Gelap di atas merah terang |
| `--warn` | `#FBBF24` | 9.99:1 on surface | |
| `--warn-fg` | `#451A03` | 8.97:1 on warn | Gelap di atas kuning terang |
| `--invest` | `#60A5FA` | 6.56:1 on surface | |
| `--glow` | `0 0 32px rgba(163,230,53,0.20)` | — | Glow lime untuk kartu hero dan elemen aktif |
| `--glass-bg` | `rgba(163,230,53,0.07)` | — | Background kartu kaca |
| `--glass-border` | `rgba(163,230,53,0.15)` | — | Border kartu kaca |

---

### Palet B · Sage & Greige

**Alasan:** Latar greige hangat (`#F4F1EB`) dan aksen sage (`#6B8F74`) memberi kesan tenang, mindful, dan dewasa — cocok untuk pencatatan keuangan harian. Sidebar kapsul melayang seperti referensi 3. Mode gelap meminjam glow oranye hangat dari referensi 4 (`#F59E0B`) sebagai aksen, menciptakan atmosfer premium yang hangat. Cocok bila Artha ingin berasa seperti buku catatan pribadi yang elegan.

#### B · Terang

| Token | Hex | Rasio kontras | Keterangan |
|---|---|---|---|
| `--bg` | `#F4F1EB` | — | Latar greige hangat |
| `--surface` | `#FFFFFF` | — | Kartu |
| `--surface-2` | `#F9F7F2` | — | Permukaan sekunder |
| `--text-1` | `#1C1A14` | 17.40:1 on surface | Teks utama, near-black hangat |
| `--text-2` | `#54503F` | 8.09:1 on surface | Teks sekunder |
| `--text-3` | `#756C62` | 5.15:1 on surface | Teks redup |
| `--border` | `#E3DDD3` | — | Separator dekoratif (WCAG-exempt) |
| `--border-input` | `#6D6057` | 6.07:1 on surface | Batas input/select |
| `--accent` | `#6B8F74` | — | Sage green — dekorasi saja, JANGAN untuk teks |
| `--accent-fg` | `#1C1A14` | 4.81:1 on accent | Teks di atas aksen |
| `--primary` | `#2D5240` | — | Sage gelap untuk tombol utama |
| `--primary-fg` | `#FFFFFF` | 8.78:1 on primary | |
| `--income` | `#2E7D5A` | 5.00:1 on surface | |
| `--income-fg` | `#FFFFFF` | 5.00:1 on income | |
| `--expense` | `#C0392B` | 5.44:1 on surface | |
| `--expense-fg` | `#FFFFFF` | 5.44:1 on expense | |
| `--warn` | `#92400E` | 7.09:1 on surface | |
| `--warn-fg` | `#FFFFFF` | 7.09:1 on warn | |
| `--invest` | `#2563EB` | 5.17:1 on surface | |

#### B · Gelap (glow hangat referensi 4)

| Token | Hex | Rasio kontras | Keterangan |
|---|---|---|---|
| `--bg` | `#18140F` | — | Near-black hangat, undertone cokelat |
| `--surface` | `#231D17` | — | Kartu |
| `--surface-2` | `#2D2519` | — | Elevated |
| `--text-1` | `#F5F0E8` | 14.70:1 on surface | Warm white |
| `--text-2` | `#C4B8A8` | 8.55:1 on surface | |
| `--text-3` | `#9E9287` | 5.49:1 on surface | |
| `--border` | `#3A3026` | — | Separator dekoratif (WCAG-exempt) |
| `--border-input` | `#8F806F` | 4.35:1 on surface | Batas input/select |
| `--accent` | `#9BB8A5` | — | Sage muda |
| `--accent-fg` | `#18140F` | 8.55:1 on accent | |
| `--primary` | `#9BB8A5` | — | |
| `--primary-fg` | `#18140F` | 8.55:1 on primary | |
| `--income` | `#52D38A` | 8.77:1 on surface | |
| `--income-fg` | `#052E16` | 7.84:1 on income | Gelap di atas hijau terang |
| `--expense` | `#F47C7C` | 6.37:1 on surface | |
| `--expense-fg` | `#450A0A` | 6.17:1 on expense | Gelap di atas merah terang |
| `--warn` | `#F59E0B` | 7.76:1 on surface | |
| `--warn-fg` | `#451A03` | 6.97:1 on warn | Gelap di atas amber terang |
| `--invest` | `#7EB8E8` | 7.87:1 on surface | |
| `--glow` | `0 0 32px rgba(245,158,11,0.15)` | — | Glow amber hangat |
| `--glass-bg` | `rgba(255,248,235,0.06)` | — | Kartu kaca warm |
| `--glass-border` | `rgba(245,158,11,0.15)` | — | Border kaca amber |

---

## 4. Tipografi

Dua keluarga font, masing-masing punya peran yang tidak tumpang tindih. Self-hosted via @fontsource supaya berfungsi offline (PWA).

| Keluarga | Paket npm | Peran |
|---|---|---|
| **Plus Jakarta Sans** | `@fontsource-variable/plus-jakarta-sans` | Semua UI: heading, label, body, navigasi |
| **DM Mono** | `@fontsource/dm-mono` | Semua angka keuangan: nominal, persentase, kuantitas aset |

**Import di `src/index.css`:**
```css
@import '@fontsource-variable/plus-jakarta-sans';
@import '@fontsource/dm-mono/400.css';
@import '@fontsource/dm-mono/500.css';
```

**Skala:**

| Token | Keluarga | Ukuran | Weight | Line-height | Letter-spacing | Penggunaan |
|---|---|---|---|---|---|---|
| `num-hero` | DM Mono | clamp(32px, 8vw, 56px) | 500 | 1.05 | -0.02em | Saldo utama Dashboard |
| `num-lg` | DM Mono | clamp(22px, 5vw, 32px) | 500 | 1.1 | -0.01em | Total portofolio, KPI |
| `num-md` | DM Mono | 16px | 400 | 1.2 | 0 | Tabel, baris transaksi |
| `num-sm` | DM Mono | 13px | 400 | 1.3 | 0 | Persentase kecil, delta |
| `h1` | Plus Jakarta Sans | 24px | 700 | 1.2 | -0.02em | Judul halaman |
| `h2` | Plus Jakarta Sans | 18px | 600 | 1.25 | -0.01em | Judul seksi |
| `body` | Plus Jakarta Sans | 15px | 400 | 1.55 | 0 | Teks paragraf, catatan |
| `label` | Plus Jakarta Sans | 13px | 500 | 1.3 | 0 | Label form, navigasi, chip |
| `muted` | Plus Jakarta Sans | 12px | 400 | 1.4 | 0.01em | Metadata, timestamp |

**CSS dasar:**
```css
body { font-family: 'Plus Jakarta Sans Variable', system-ui, sans-serif; }
.num { font-family: 'DM Mono', 'Courier New', monospace; }
```

DM Mono adalah monospace sehingga angka otomatis tabular — tidak perlu `font-feature-settings: 'tnum'`.

---

## 5. Nominal Panjang

Nominal keuangan Indonesia bisa mencapai 13 digit (`Rp 1.234.567.890`). Aturan agar selalu muat di 360px tanpa overflow.

### Ukuran Fluid (clamp)

```css
.num-hero { font-size: clamp(28px, 7.5vw, 56px); }
.num-lg   { font-size: clamp(20px, 4.5vw, 32px); }
```

Di 360px: `num-hero` ≈ 27px, `num-lg` ≈ 16px — cukup untuk 13 karakter.

### Singkatan Jika Masih Overflow

Jika container memiliki `overflow: hidden` dan teks masih terpotong, tampilkan versi singkat dan nilai penuh pada hover/tap:

| Nilai | Singkatan |
|---|---|
| < 1.000.000 | Tampil penuh |
| ≥ 1.000.000 | `Rp 1,23 Jt` |
| ≥ 1.000.000.000 | `Rp 1,23 M` |
| ≥ 1.000.000.000.000 | `Rp 1,23 T` |

```ts
function formatShort(n: number): string {
  if (n >= 1e12) return `Rp ${(n / 1e12).toFixed(2)} T`
  if (n >= 1e9)  return `Rp ${(n / 1e9).toFixed(2)} M`
  if (n >= 1e6)  return `Rp ${(n / 1e6).toFixed(2)} Jt`
  return idr(n)
}
```

Nilai penuh tersedia via `title` attribute (desktop hover) dan tooltip singkat pada tap (mobile).

### Deteksi Overflow

```ts
const el = ref.current
if (el && el.scrollWidth > el.clientWidth) {
  setDisplayValue(formatShort(amount))
}
```

---

## 6. Radius

| Token | Nilai | Penggunaan |
|---|---|---|
| `--radius-xs` | 6px | Chip, badge, tag, status pill |
| `--radius-sm` | 10px | Input, select, tooltip, small button |
| `--radius-md` | 16px | Tombol utama, kartu sekunder |
| `--radius-lg` | 24px | Kartu bento utama |
| `--radius-xl` | 32px | Kartu hero, portofolio |
| `--radius-full` | 9999px | Pill navigasi, tab aktif, toggle tema |

---

## 7. Bayangan

Bayangan light mode menggunakan warna teks (bukan hitam murni) agar terasa kohesif dengan palet.

| Token | Terang | Gelap |
|---|---|---|
| `--shadow-sm` | `0 1px 3px rgba(14,30,21,.06), 0 1px 2px rgba(14,30,21,.04)` | `0 1px 3px rgba(0,0,0,.30)` |
| `--shadow-md` | `0 4px 16px rgba(14,30,21,.08), 0 2px 4px rgba(14,30,21,.04)` | `0 4px 16px rgba(0,0,0,.40)` |
| `--shadow-lg` | `0 12px 40px rgba(14,30,21,.10), 0 4px 8px rgba(14,30,21,.05)` | `0 12px 40px rgba(0,0,0,.50)` |
| `--glow` | `none` | Lihat tabel palet — berbeda per arah |

Palet B light memakai `rgba(28,26,20,...)` pada shadow-sm/md/lg.

---

## 8. Spacing

Basis 8px. Semua spacing adalah kelipatan 4 atau 8.

| Token | Nilai | Contoh penggunaan |
|---|---|---|
| `--space-1` | 4px | Gap ikon–teks dalam chip |
| `--space-2` | 8px | Gap antar elemen kecil, margin badge |
| `--space-3` | 12px | Padding chip, gap navigasi, gap grid mobile |
| `--space-4` | 16px | Padding kartu kecil, gap grid tablet |
| `--space-5` | 20px | Padding kartu KPI |
| `--space-6` | 24px | Padding kartu bento, gap grid desktop |
| `--space-8` | 32px | Padding hero card |
| `--space-10` | 40px | Top padding halaman |
| `--space-12` | 48px | Gap antar seksi besar |
| `--space-16` | 64px | Padding seksi hero |

---

## 9. Grid Bento

### Mobile (< 768px)
- 1 kolom, `padding: 16px`, `gap: 12px`
- Semua kartu lebar penuh, stack vertikal
- Konten diberi `padding-bottom: 112px` agar tidak tertutup tab bar

### Tablet (768–1023px)
- 2 kolom `1fr 1fr`, `gap: 16px`
- Kartu hero span 2 kolom
- Sidebar tersembunyi, bottom nav aktif

### Desktop (≥ 1024px)
- Sidebar kiri 224px, konten di kanan
- Grid 12 kolom, `gap: 20px`
- KPI cards: masing-masing `span 3` (4 kartu = 12 kolom)
- Portfolio hero: `span 8` — Investment summary: `span 4`
- Grafik berdampingan: `span 6` masing-masing
- Tabel penuh lebar: `span 12`

```css
.bento { display: grid; grid-template-columns: repeat(12, 1fr); gap: 20px; }
.bento-kpi     { grid-column: span 3; }
.bento-hero    { grid-column: span 8; }
.bento-summary { grid-column: span 4; }
.bento-half    { grid-column: span 6; }
.bento-full    { grid-column: span 12; }
```

---

## 10. Pola Komponen

### Kartu (card)
```css
background: var(--surface);
border: 1px solid var(--border);
border-radius: var(--radius-lg);
box-shadow: var(--shadow-sm);
padding: var(--space-6);
transition: box-shadow 200ms ease-out;
&:hover { box-shadow: var(--shadow-md); }
```

### Kartu KPI
radius-lg, padding 20px, angka `num-lg`, sparkline 40px tinggi di bawah, delta 12px dengan ikon ↑↓.

### Kartu Portofolio Hero
`background: var(--primary); color: var(--primary-fg); border-radius: var(--radius-xl); padding: 32px.` Dua lingkaran dekoratif absolut (blur/transparent). Dark mode: `box-shadow: var(--glow), var(--shadow-lg)`.

### Tombol Utama (btn)
```css
background: var(--primary); color: var(--primary-fg);
border: none; border-radius: var(--radius-md);
padding: 10px 20px; min-height: 44px;
font-weight: 600; font-size: 14px; cursor: pointer;
transition: opacity 150ms ease-out;
&:hover { opacity: 0.88; }
&:focus-visible { outline: 2px solid var(--primary); outline-offset: 2px; }
```

### Tombol Ghost (btn-ghost)
```css
background: transparent; color: var(--text-2);
border: 1px solid var(--border); border-radius: var(--radius-md);
padding: 10px 20px; min-height: 44px;
&:hover { background: var(--surface-2); color: var(--text-1); }
```

### Input / Select
```css
background: var(--surface-2); color: var(--text-1);
border: 1px solid var(--border-input); border-radius: var(--radius-sm);
padding: 10px 16px; min-height: 44px; font-size: 15px;
&:focus { outline: 2px solid var(--primary); outline-offset: 0; border-color: transparent; }
```

### Tab Bar Mobile

```css
position: fixed; bottom: 0; inset-x: 0; z-index: 10;
background: color-mix(in srgb, var(--surface) 95%, transparent);
backdrop-filter: blur(16px);
padding-bottom: env(safe-area-inset-bottom);
border-top: 1px solid var(--border);
```

5 item sejajar, min 44×44px. **Item aktif wajib memiliki background block** — pill `border-radius: var(--radius-full)`, `background: var(--primary)`, `color: var(--primary-fg)`. Item tidak aktif: warna `var(--text-3)`.

### Sidebar Desktop
```css
position: sticky; top: 0; height: 100vh; width: 224px;
border-right: 1px solid var(--border);
```
Item navigasi: `border-radius: 12px; min-height: 44px; padding: 10px 12px; gap: 12px`.
Aktif: `background: var(--primary); color: var(--primary-fg)`.
Hover: `background: var(--surface-2)`.

### Pill Navigasi (halaman tab)
Container dengan `border: 1px solid var(--border); border-radius: var(--radius-full); padding: 3px`. Item aktif: `background: var(--primary); color: var(--primary-fg); border-radius: var(--radius-full)`.

### Toggle Tema
Pill tiga-item (Terang / Sistem / Gelap) dengan `role="radiogroup"` + `role="radio"`. Item aktif: `background: var(--surface); box-shadow: var(--shadow-sm)`. Jangan gunakan checkbox tersembunyi.

### Kartu Kaca (dark mode only)
```css
background: var(--glass-bg);
backdrop-filter: blur(16px);
-webkit-backdrop-filter: blur(16px);
border: 1px solid var(--glass-border);
border-radius: var(--radius-lg);
```

---

## 11. Aturan Motion

Artha menggunakan `motion/react` (paket `motion`) dengan `LazyMotion` + `domAnimation` untuk interaktivitas ringan, dan CSS transition untuk micro-interaction. Tidak menggunakan GSAP (tidak ada dalam dependensi; menambahnya memerlukan justifikasi kuat).

| Kategori | Durasi | Easing | Implementasi |
|---|---|---|---|
| Micro | 150ms | `ease-out` | CSS `transition` — hover tombol, perubahan warna fokus |
| Komponen | 250ms | `ease-out` | `motion/react` `<m.div>` — dropdown, tooltip, tab switch |
| Halaman | 400ms | `[0.34,1.56,0.64,1]` (spring) | `motion/react` stagger kartu masuk, transisi antar halaman |

**Properti yang boleh dianimasikan:** `opacity`, `transform`, `color`, `background-color`, `border-color`, `box-shadow`.

**DILARANG:** `width`, `height`, `top`, `left`, `margin`, `padding` — gunakan `transform: scale/translate`.

**Stagger kartu masuk (motion/react):**
```tsx
import { LazyMotion, domAnimation, m } from 'motion/react'

// Di komponen shell:
<LazyMotion features={domAnimation}>
  {cards.map((card, i) => (
    <m.div
      key={card.id}
      initial={{ opacity: 0, scale: 0.95, y: 12 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ duration: 0.4, delay: i * 0.06, ease: [0.34, 1.56, 0.64, 1] }}
    >
      {card.content}
    </m.div>
  ))}
</LazyMotion>
```

**Wajib di `src/index.css`:**
```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

Selain itu, bungkus semua animasi `motion/react` dengan pemeriksaan:
```ts
const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
```

---

## 12. Aturan 3D

Efek tumpukan kartu untuk kartu investasi per akun (maksimal 3 kartu).

```css
.stack-scene { perspective: 900px; position: relative; }

.stack-card { transition: transform 300ms ease-out; }
.stack-card-3 { transform: translateY(22px) scale(0.94); z-index: 1; }
.stack-card-2 { transform: translateY(12px) scale(0.97); z-index: 2; }
.stack-card-1 { transform: translateY(0px)  scale(1.00); z-index: 3;
                box-shadow: var(--glow), var(--shadow-lg); }

.stack-scene:hover .stack-card-1 { transform: translateY(-8px) scale(1); }
.stack-scene:hover .stack-card-2 { transform: translateY(8px)  scale(0.97); }
.stack-scene:hover .stack-card-3 { transform: translateY(22px) scale(0.94); }
```

**Tilt mengikuti pointer (kartu terdepan):**
```ts
function onPointerMove(e: PointerEvent) {
  const rect = el.getBoundingClientRect()
  const cx = (e.clientX - rect.left) / rect.width  - 0.5  // -0.5 .. 0.5
  const cy = (e.clientY - rect.top)  / rect.height - 0.5
  el.style.transform = `rotateY(${cx * 12}deg) rotateX(${cy * -8}deg) scale(1.01)`
}
function onPointerLeave() {
  el.style.transform = ''
}
```

Tilt dibatasi ±12° horisontal dan ±8° vertikal. Selalu reset ke netral saat pointer keluar. Dinonaktifkan jika `prefers-reduced-motion: reduce`.

**Mobile:**
- Tumpukan tetap terlihat, bukan tersembunyi.
- Kartu 2 dan 3 diperlihatkan lebih kecil di belakang (`scale(0.90)`, `scale(0.82)`) agar tumpukan muat di layar.
- Geser (swipe) ke kiri/kanan untuk menukar kartu aktif ke depan.
- Pointer-tracking tilt dinonaktifkan di mobile (pointer events touch tidak mendukung hovernya).

**Aturan:**
- Maks. 3 kartu dalam satu tumpukan
- Setiap kartu mundur 10–12px Y dan 0.03 lebih kecil (`scale`)
- DILARANG: `transform-style: preserve-3d` pada daftar panjang, library 3D untuk efek dekoratif

---

## 13. Aksesibilitas

| Aturan | Detail |
|---|---|
| Kontras teks normal | Minimal 4.5:1 (WCAG AA) di semua 4 kombinasi palet × tema |
| Kontras teks besar (≥ 18px regular / ≥ 14px bold) | Minimal 3:1 |
| Kontras komponen UI | Minimal 3:1 untuk `--border-input` dan ikon status; `--border` (separator dekoratif) dikecualikan sesuai WCAG 1.4.11 |
| Touch target | Minimal 44 × 44px untuk semua tombol dan item navigasi |
| Fokus visible | `outline: 2px solid var(--primary); outline-offset: 2px` — jangan hapus |
| Keyboard | Tab, Enter, Space untuk semua fungsi interaktif |
| Warna semantik | Selalu ada ikon (↑ ↓) atau teks pendamping — warna bukan satu-satunya penanda |
| Screen reader | `aria-label` pada tombol ikon, `aria-live="polite"` untuk status sinkron |
| Reduced motion | `@media (prefers-reduced-motion: reduce)` mengatur ulang semua animasi; `motion/react` dibungkus pemeriksaan runtime |
| Grafik | Label langsung di elemen grafik; tabel data sebagai fallback tersembunyi (`<caption>`, `class="sr-only"`) |
| Bahasa | `lang="id"` pada `<html>` |

**Verifikasi kontras:** Jalankan `npm run check:contrast` untuk memverifikasi semua 72 pasangan teks/latar di keempat kombinasi. Script ini wajib lolos sebelum merge ke main.
