const pad = (n: number) => String(n).padStart(2, '0')

/** Tanggal lokal hari ini (YYYY-MM-DD), bukan UTC. */
export function todayISO(d = new Date()): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** 'YYYY-MM' dari tanggal ISO. */
export const monthKey = (iso: string) => iso.slice(0, 7)

export function shiftMonth(key: string, delta: number): string {
  const [y, m] = key.split('-').map(Number)
  const d = new Date(y, m - 1 + delta, 1)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`
}

export function monthLabel(key: string): string {
  const [y, m] = key.split('-').map(Number)
  return new Intl.DateTimeFormat('id-ID', { month: 'long', year: 'numeric' }).format(new Date(y, m - 1, 1))
}

export function dateLabel(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  return new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }).format(
    new Date(y, m - 1, d),
  )
}

const idrFmt = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 })
export const idr = (n: number) => idrFmt.format(Math.round(n))

export function num(n: number, maxFraction = 8): string {
  return new Intl.NumberFormat('id-ID', { maximumFractionDigits: maxFraction }).format(n)
}

export function pct(n: number | null | undefined, digits = 2): string {
  if (n == null || !Number.isFinite(n)) return '-'
  const sign = n > 0 ? '+' : ''
  return `${sign}${(n * 100).toFixed(digits)}%`
}

export function signedIdr(n: number): string {
  return `${n > 0 ? '+' : ''}${idr(n)}`
}

/**
 * Parser angka yang ramah format Indonesia.
 * "1.500.000" -> 1500000, "0,0025" -> 0.0025, "0.0025" -> 0.0025
 * dotIsDecimal=true: titik selalu dianggap desimal (untuk kuantitas BTC/gram).
 */
export function parseNum(input: string, dotIsDecimal = false): number {
  let t = input.trim().replace(/\s/g, '')
  if (!t) return NaN
  if (t.includes(',') && t.includes('.')) t = t.replace(/\./g, '').replace(',', '.')
  else if (t.includes(',')) t = t.replace(',', '.')
  else if (!dotIsDecimal && /^[1-9]\d{0,2}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, '')
  return Number(t)
}

export const plClass = (n: number) =>
  n > 0 ? 'text-emerald-600 dark:text-emerald-400' : n < 0 ? 'text-rose-600 dark:text-rose-400' : ''
