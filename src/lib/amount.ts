const idrFmt = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 })

export function formatShort(n: number): string {
  if (!Number.isFinite(n)) return 'Rp -'
  const abs = Math.abs(n)
  const sign = n < 0 ? '-' : ''
  const fmt = (v: number) => {
    const s = v.toFixed(2).replace('.', ',').replace(/,?0+$/, '')
    return s === '' ? '0' : s
  }
  if (abs >= 1e12) return `${sign}Rp ${fmt(abs / 1e12)} T`
  if (abs >= 1e9)  return `${sign}Rp ${fmt(abs / 1e9)} M`
  if (abs >= 1e6)  return `${sign}Rp ${fmt(abs / 1e6)} Jt`
  return idrFmt.format(n)
}
