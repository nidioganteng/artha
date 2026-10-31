const idrFmt = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 })

export function formatShort(n: number): string {
  if (!Number.isFinite(n)) return 'Rp -'
  const abs = Math.abs(n)
  const sign = n < 0 ? '-' : ''
  if (abs >= 1e12) return `${sign}Rp ${(abs / 1e12).toFixed(2)} T`
  if (abs >= 1e9)  return `${sign}Rp ${(abs / 1e9).toFixed(2)} M`
  if (abs >= 1e6)  return `${sign}Rp ${(abs / 1e6).toFixed(2)} Jt`
  return idrFmt.format(n)
}
