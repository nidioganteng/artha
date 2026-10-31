// Verifikasi kontras WCAG untuk semua 4 kombinasi palet × tema.
// Jalankan: npm run check:contrast
//
// Ambang:
//   4.5:1 — teks normal (< 18px regular atau < 14px bold)
//   3.0:1 — teks besar (≥ 18px atau ≥ 14px bold) dan komponen UI interaktif
//
// Catatan arsitektur:
//   --border adalah separator dekoratif antar kartu (exempt dari WCAG 1.4.11
//   karena tidak menyampaikan informasi komponen yang wajib dikenali pengguna).
//   --border-input adalah batas elemen input interaktif dan diuji di sini (3:1).

type Hex = string

function hexToRgb(hex: Hex): [number, number, number] {
  const h = hex.replace('#', '').slice(0, 6)
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]
}

function linearize(c: number): number {
  const s = c / 255
  return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
}

function luminance(hex: Hex): number {
  const [r, g, b] = hexToRgb(hex)
  return 0.2126 * linearize(r) + 0.7152 * linearize(g) + 0.0722 * linearize(b)
}

function ratio(fg: Hex, bg: Hex): number {
  const lf = luminance(fg), lb = luminance(bg)
  const hi = Math.max(lf, lb), lo = Math.min(lf, lb)
  return (hi + 0.05) / (lo + 0.05)
}

const THEMES: { name: string; t: Record<string, Hex> }[] = [
  {
    name: 'A · Lime & Hutan · TERANG',
    t: {
      bg:             '#F1F3EF',
      surface:        '#FFFFFF',
      'surface-2':    '#F6F8F4',
      'text-1':       '#0E1E15',
      'text-2':       '#3D5948',
      'text-3':       '#4D7362', // ≥4.5:1 pada bg dan surface
      accent:         '#84CC16',
      'accent-fg':    '#1A3A28', // gelap di atas lime
      primary:        '#1A3A28',
      'primary-fg':   '#FFFFFF',
      income:         '#15803D', // lebih gelap dari #16A34A asal
      'income-fg':    '#FFFFFF',
      expense:        '#DC2626',
      'expense-fg':   '#FFFFFF',
      warn:           '#B45309', // lebih gelap dari #D97706 asal
      'warn-fg':      '#FFFFFF',
      invest:         '#2563EB',
      'border-input': '#6B8F7B', // batas input/select ≥3:1 pada surface-2
    },
  },
  {
    name: 'A · Lime & Hutan · GELAP',
    t: {
      bg:             '#0B1910',
      surface:        '#132119',
      'surface-2':    '#1B3024',
      'text-1':       '#EBF4EC',
      'text-2':       '#8CB89A',
      'text-3':       '#7AAD90', // lebih terang dari #4E7059 asal
      accent:         '#A3E635',
      'accent-fg':    '#0B1910',
      primary:        '#A3E635',
      'primary-fg':   '#0B1910',
      income:         '#4ADE80',
      'income-fg':    '#052E16', // gelap di atas lime terang
      expense:        '#F87171',
      'expense-fg':   '#450A0A', // gelap di atas merah terang
      warn:           '#FBBF24',
      'warn-fg':      '#451A03', // gelap di atas kuning terang
      invest:         '#60A5FA',
      'border-input': '#5A9470', // ≥3:1 pada surface-2 gelap
    },
  },
  {
    name: 'B · Sage & Greige · TERANG',
    t: {
      bg:             '#F4F1EB',
      surface:        '#FFFFFF',
      'surface-2':    '#F9F7F2',
      'text-1':       '#1C1A14',
      'text-2':       '#54503F',
      'text-3':       '#756C62', // lebih gelap dari #9A9186 asal
      accent:         '#6B8F74',
      'accent-fg':    '#1C1A14', // gelap di atas sage
      primary:        '#2D5240',
      'primary-fg':   '#FFFFFF',
      income:         '#2E7D5A',
      'income-fg':    '#FFFFFF',
      expense:        '#C0392B',
      'expense-fg':   '#FFFFFF',
      warn:           '#92400E', // lebih gelap dari #C07A23 asal
      'warn-fg':      '#FFFFFF',
      invest:         '#2563EB',
      'border-input': '#6D6057', // ≥3:1 pada surface-2 greige
    },
  },
  {
    name: 'B · Sage & Greige · GELAP',
    t: {
      bg:             '#18140F',
      surface:        '#231D17',
      'surface-2':    '#2D2519',
      'text-1':       '#F5F0E8',
      'text-2':       '#C4B8A8',
      'text-3':       '#9E9287', // lebih terang dari #7A6E62 asal
      accent:         '#9BB8A5',
      'accent-fg':    '#18140F',
      primary:        '#9BB8A5',
      'primary-fg':   '#18140F',
      income:         '#52D38A',
      'income-fg':    '#052E16',
      expense:        '#F47C7C',
      'expense-fg':   '#450A0A',
      warn:           '#F59E0B',
      'warn-fg':      '#451A03',
      invest:         '#7EB8E8',
      'border-input': '#8F806F', // ≥3:1 pada surface-2 gelap hangat
    },
  },
]

interface Pair {
  fg: string
  bg: string
  label: string
  min: number
}

const PAIRS: Pair[] = [
  // Teks pada latar dan permukaan
  { fg: 'text-1', bg: 'bg',        label: 'text-1 pada bg',            min: 4.5 },
  { fg: 'text-1', bg: 'surface',   label: 'text-1 pada surface',       min: 4.5 },
  { fg: 'text-2', bg: 'bg',        label: 'text-2 pada bg',            min: 4.5 },
  { fg: 'text-2', bg: 'surface',   label: 'text-2 pada surface',       min: 4.5 },
  { fg: 'text-3', bg: 'bg',        label: 'text-3 pada bg',            min: 4.5 },
  { fg: 'text-3', bg: 'surface',   label: 'text-3 pada surface',       min: 4.5 },
  { fg: 'text-3', bg: 'surface-2', label: 'text-3 pada surface-2',     min: 4.5 },
  // Tombol dan interaktif
  { fg: 'primary-fg', bg: 'primary', label: 'primary-fg pada primary',  min: 4.5 },
  { fg: 'accent-fg',  bg: 'accent',  label: 'accent-fg pada accent',    min: 4.5 },
  // Chip semantik
  { fg: 'income-fg',  bg: 'income',  label: 'income-fg pada income',    min: 4.5 },
  { fg: 'expense-fg', bg: 'expense', label: 'expense-fg pada expense',  min: 4.5 },
  { fg: 'warn-fg',    bg: 'warn',    label: 'warn-fg pada warn',        min: 4.5 },
  // Warna semantik sebagai teks (delta, label) pada permukaan
  { fg: 'income',  bg: 'surface', label: 'income sebagai teks',         min: 4.5 },
  { fg: 'expense', bg: 'surface', label: 'expense sebagai teks',        min: 4.5 },
  { fg: 'warn',    bg: 'surface', label: 'warn sebagai teks',           min: 4.5 },
  { fg: 'invest',  bg: 'surface', label: 'invest sebagai teks',         min: 4.5 },
  // Batas input interaktif (WCAG 1.4.11, min 3:1)
  { fg: 'border-input', bg: 'surface-2', label: 'border-input pada surface-2', min: 3.0 },
  { fg: 'border-input', bg: 'surface',   label: 'border-input pada surface',   min: 3.0 },
]

let totalFailed = 0

function ok(name: string, pass: boolean, detail = '') {
  const tag = pass ? 'LOLOS' : 'GAGAL'
  console.log(`${tag}  ${name}${detail ? '  |  ' + detail : ''}`)
  if (!pass) totalFailed++
}

for (const theme of THEMES) {
  console.log(`\n── ${theme.name} ──`)
  for (const p of PAIRS) {
    const fgHex = theme.t[p.fg]
    const bgHex = theme.t[p.bg]
    if (!fgHex || !bgHex) {
      ok(p.label, false, `token ${!fgHex ? p.fg : p.bg} tidak ditemukan`)
      continue
    }
    const r = ratio(fgHex, bgHex)
    ok(p.label, r >= p.min, `${r.toFixed(2)}:1 (min ${p.min})  ${p.fg}=${fgHex} ${p.bg}=${bgHex}`)
  }
}

console.log(
  totalFailed === 0
    ? '\nSemua uji kontras lolos.'
    : `\n${totalFailed} uji kontras GAGAL.`,
)
process.exit(totalFailed === 0 ? 0 : 1)
