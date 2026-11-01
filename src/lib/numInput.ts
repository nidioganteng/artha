/**
 * Fungsi murni untuk komponen input angka.
 * Tanpa dependensi eksternal.
 */

/** Format string digit mentah ke tampilan ribuan titik. "50000" -> "50.000" */
export function formatMoneyInput(raw: string): string {
  const digits = raw.replace(/[^\d]/g, '').slice(0, 15)
  if (!digits) return ''
  const clean = digits.replace(/^0+/, '') || '0'
  return clean.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
}

/** Parse tampilan ke number atau null. "50.000" -> 50000, "" -> null */
export function parseMoneyInput(display: string): number | null {
  const stripped = display.replace(/\./g, '').trim()
  if (!stripped) return null
  const n = Number(stripped)
  return Number.isFinite(n) ? n : null
}

/**
 * Format string mentah ke tampilan quantity dengan koma sebagai pemisah desimal.
 * "0.5" -> "0,5"; "1,2,3" -> "1,23"; "0,123456789" (max 8) -> "0,12345678"
 */
export function formatQuantityInput(raw: string, maxDecimals = 8): string {
  // Normalisasi: titik -> koma, strip karakter tidak valid
  let s = raw.replace(/\./g, ',').replace(/[^\d,]/g, '')

  // Hanya satu koma (simpan posisi koma pertama)
  const firstComma = s.indexOf(',')
  if (firstComma !== -1) {
    s = s.slice(0, firstComma + 1) + s.slice(firstComma + 1).replace(/,/g, '')
  }

  const hasComma = s.includes(',')
  const [intRaw, fracRaw] = hasComma ? s.split(',', 2) : [s, undefined]

  // Strip leading zeros dari bagian bulat, pertahankan minimal satu angka
  const cleanInt = intRaw.replace(/^0+/, '') || '0'

  if (fracRaw !== undefined) {
    return `${cleanInt},${fracRaw.slice(0, maxDecimals)}`
  }
  return cleanInt
}

/** Parse tampilan quantity ke number atau null. "0,5" -> 0.5, "" -> null */
export function parseQuantityInput(display: string): number | null {
  const stripped = display.trim()
  if (!stripped) return null
  const n = Number(stripped.replace(',', '.'))
  return Number.isFinite(n) ? n : null
}
