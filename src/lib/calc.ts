// Kalkulasi investasi: rata-rata beli (moving average), modal, untung/rugi, ROI, CAGR, XIRR.
// Fungsi murni tanpa dependensi supaya mudah diuji (lihat scripts/check-calc.ts).

export interface TradeLite {
  side: 'buy' | 'sell'
  quantity: number
  price: number // harga per unit
  fee: number
  date: string // YYYY-MM-DD
}

export interface Flow {
  date: string
  amount: number // negatif = uang keluar (beli), positif = uang masuk (jual / nilai akhir)
}

export interface Position {
  qty: number // sisa unit
  avgPrice: number // harga rata-rata beli unit yang masih dipegang
  costBasis: number // modal unit yang masih dipegang (qty * avgPrice)
  totalBought: number // total uang yang pernah dikeluarkan untuk beli (termasuk fee)
  totalSold: number // total uang bersih dari penjualan
  realized: number // untung/rugi dari unit yang sudah dijual
  price: number // harga pasar yang dipakai
  value: number // nilai sekarang (qty * price)
  unrealized: number // value - costBasis
  totalPL: number // value + totalSold - totalBought
  roi: number | null // totalPL / totalBought
  firstDate: string | null
  days: number
  cagr: number | null
  xirr: number | null
}

const DAY = 86_400_000

/** Tanggal lokal (bukan UTC) supaya hari berganti sesuai zona waktu perangkat. */
function localISO(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

function toDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function daysBetween(fromISO: string, to: Date): number {
  const t = new Date(to.getFullYear(), to.getMonth(), to.getDate())
  return Math.round((t.getTime() - toDate(fromISO).getTime()) / DAY)
}

/** Arus kas dari daftar trade (tanpa nilai akhir). */
export function flowsOf(trades: TradeLite[]): Flow[] {
  return trades.map((t) => ({
    date: t.date,
    amount: t.side === 'buy' ? -(t.quantity * t.price + t.fee) : t.quantity * t.price - t.fee,
  }))
}

/** XIRR dengan bisection. Mengembalikan null jika tidak ada solusi. */
export function xirr(flows: Flow[]): number | null {
  if (flows.length < 2) return null
  if (!flows.some((f) => f.amount < 0) || !flows.some((f) => f.amount > 0)) return null
  const sorted = [...flows].sort((a, b) => a.date.localeCompare(b.date))
  const t0 = toDate(sorted[0].date).getTime()
  const npv = (r: number) =>
    sorted.reduce((s, f) => s + f.amount / Math.pow(1 + r, (toDate(f.date).getTime() - t0) / DAY / 365), 0)

  let lo = -0.9999
  let hi = 1000
  let fLo = npv(lo)
  const fHi = npv(hi)
  if (!Number.isFinite(fLo) || !Number.isFinite(fHi) || fLo * fHi > 0) return null
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2
    const fMid = npv(mid)
    if (Math.abs(fMid) < 1e-7) return mid
    if (fLo * fMid < 0) hi = mid
    else {
      lo = mid
      fLo = fMid
    }
  }
  return (lo + hi) / 2
}

function annualize(ending: number, invested: number, days: number): number | null {
  if (invested <= 0 || ending <= 0 || days < 30) return null
  return Math.pow(ending / invested, 365 / days) - 1
}

/**
 * Hitung posisi satu aset dari riwayat trade.
 * price = harga pasar sekarang; jika null dipakai harga rata-rata (untung/rugi 0).
 */
export function computePosition(trades: TradeLite[], price: number | null, today = new Date()): Position {
  const sorted = [...trades].sort((a, b) => a.date.localeCompare(b.date))
  let qty = 0
  let cost = 0
  let totalBought = 0
  let totalSold = 0
  let realized = 0

  for (const t of sorted) {
    if (t.side === 'buy') {
      const paid = t.quantity * t.price + t.fee
      qty += t.quantity
      cost += paid
      totalBought += paid
    } else {
      const sellQty = Math.min(t.quantity, qty)
      const avg = qty > 0 ? cost / qty : 0
      const proceeds = t.quantity * t.price - t.fee
      totalSold += proceeds
      realized += proceeds - avg * sellQty
      cost -= avg * sellQty
      qty -= sellQty
    }
  }
  if (qty < 1e-12) {
    qty = 0
    cost = 0
  }

  const avgPrice = qty > 0 ? cost / qty : 0
  const px = price ?? avgPrice
  const value = qty * px
  const totalPL = value + totalSold - totalBought
  const firstDate = sorted.length ? sorted[0].date : null
  const days = firstDate ? daysBetween(firstDate, today) : 0

  const flows = flowsOf(sorted)
  if (value > 0) flows.push({ date: localISO(today), amount: value })

  return {
    qty,
    avgPrice,
    costBasis: cost,
    totalBought,
    totalSold,
    realized,
    price: px,
    value,
    unrealized: value - cost,
    totalPL,
    roi: totalBought > 0 ? totalPL / totalBought : null,
    firstDate,
    days,
    cagr: annualize(value + totalSold, totalBought, days),
    xirr: days >= 30 ? xirr(flows) : null,
  }
}

export interface Summary {
  totalBought: number
  costBasis: number
  value: number
  totalSold: number
  realized: number
  unrealized: number
  totalPL: number
  roi: number | null
  cagr: number | null
  xirr: number | null
  days: number
}

/** Ringkasan seluruh portofolio dari banyak posisi dan arus kasnya. */
export function summarize(positions: Position[], allTrades: TradeLite[], today = new Date()): Summary {
  const sum = (f: (p: Position) => number) => positions.reduce((s, p) => s + f(p), 0)
  const totalBought = sum((p) => p.totalBought)
  const totalSold = sum((p) => p.totalSold)
  const value = sum((p) => p.value)
  const dates = allTrades.map((t) => t.date).sort()
  const days = dates.length ? daysBetween(dates[0], today) : 0
  const totalPL = value + totalSold - totalBought

  const flows = flowsOf(allTrades)
  if (value > 0) flows.push({ date: localISO(today), amount: value })

  return {
    totalBought,
    costBasis: sum((p) => p.costBasis),
    value,
    totalSold,
    realized: sum((p) => p.realized),
    unrealized: sum((p) => p.unrealized),
    totalPL,
    roi: totalBought > 0 ? totalPL / totalBought : null,
    cagr: annualize(value + totalSold, totalBought, days),
    xirr: days >= 30 ? xirr(flows) : null,
    days,
  }
}
