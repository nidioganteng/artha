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

// ─────────────────────────────────────────────────────────────────────────────
// portfolioSeries — titik bulanan untuk grafik perkembangan investasi.
//
// Fungsi murni: ambil daftar trade + aset + riwayat harga, kembalikan nilai,
// modal, dan untung/rugi di akhir tiap bulan. Dipakai InvestmentChart.
// ─────────────────────────────────────────────────────────────────────────────

export type PriceQuality = 'market' | 'estimate'

export interface SeriesPoint {
  month: string           // "YYYY-MM"
  qty: number             // jumlah dipegang akhir bulan (agregasi aset terpilih)
  cost: number            // modal tersisa
  value: number           // qty × harga
  price: number           // harga dipakai (single asset) atau 0 (agregat)
  quality: PriceQuality   // worst-case: 'estimate' kalau ada satu aset estimate
  pl: number              // value - cost
  mom: number | null      // month-over-month % change dari value
  momAbs: number | null   // selisih absolut nilai bulan ini vs bulan sebelumnya
}

interface SeriesTradeInput {
  id: string
  asset_id: string
  side: 'buy' | 'sell'
  quantity: number
  price_per_unit: number
  fee: number
  traded_on: string
}
interface SeriesAssetInput {
  id: string
  symbol: string
}
interface SeriesPriceInput {
  asset_id: string
  date: string
  price: number
  source: string
}

function monthOf(iso: string): string {
  return iso.slice(0, 7)
}

function addMonth(key: string, delta: number): string {
  const [y, m] = key.split('-').map(Number)
  const d = new Date(y, m - 1 + delta, 1)
  const yy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  return `${yy}-${mm}`
}

function lastDayOfMonth(key: string): string {
  const [y, m] = key.split('-').map(Number)
  const last = new Date(y, m, 0).getDate() // day 0 next month = last day this month
  return `${key}-${String(last).padStart(2, '0')}`
}

function monthRange(firstKey: string, lastKey: string): string[] {
  const out: string[] = []
  let cur = firstKey
  // safety cap: 240 months (20 tahun)
  for (let i = 0; i < 240 && cur <= lastKey; i++) {
    out.push(cur)
    cur = addMonth(cur, 1)
  }
  return out
}

interface PerAssetState {
  qty: number
  avgCost: number
}

/**
 * Jalankan trades aset satu per satu secara kronologis sampai tanggal
 * `endInclusiveISO` (inklusif). Pakai moving average cost basis.
 */
function statePerAssetUpTo(
  trades: SeriesTradeInput[],
  endInclusiveISO: string,
): PerAssetState {
  let qty = 0
  let avgCost = 0
  const sorted = [...trades].sort((a, b) => a.traded_on.localeCompare(b.traded_on))
  for (const t of sorted) {
    if (t.traded_on > endInclusiveISO) break
    if (t.side === 'buy') {
      const newQty = qty + t.quantity
      if (newQty <= 0) {
        qty = 0
        avgCost = 0
        continue
      }
      avgCost = (avgCost * qty + t.quantity * t.price_per_unit + t.fee) / newQty
      qty = newQty
    } else {
      // sell: qty berkurang, avgCost tidak berubah
      qty = Math.max(0, qty - t.quantity)
      if (qty < 1e-12) {
        qty = 0
        avgCost = 0
      }
    }
  }
  return { qty, avgCost }
}

/** Cari harga pasar untuk aset pada akhir bulan `monthKey` (atau sebelum). */
function priceAtMonthEnd(
  assetId: string,
  monthKey: string,
  priceHistory: SeriesPriceInput[],
): number | null {
  const cutoff = lastDayOfMonth(monthKey)
  let best: SeriesPriceInput | null = null
  for (const p of priceHistory) {
    if (p.asset_id !== assetId) continue
    if (p.date > cutoff) continue
    if (!best || p.date > best.date) best = p
  }
  return best ? best.price : null
}

/** Harga implisit dari trade terdekat (<= akhir bulan). */
function implicitPriceAtMonthEnd(
  assetId: string,
  monthKey: string,
  trades: SeriesTradeInput[],
): number | null {
  const cutoff = lastDayOfMonth(monthKey)
  let best: SeriesTradeInput | null = null
  for (const t of trades) {
    if (t.asset_id !== assetId) continue
    if (t.traded_on > cutoff) continue
    if (!best || t.traded_on > best.traded_on) best = t
  }
  return best ? best.price_per_unit : null
}

export function portfolioSeries(
  trades: SeriesTradeInput[],
  assets: SeriesAssetInput[],
  priceHistory: SeriesPriceInput[],
  currentPrices: Record<string, number>,
  filter: string, // 'all' atau asset_id
  range: 6 | 12 | 'all',
  today: string,
): SeriesPoint[] {
  const todayMonth = monthOf(today)
  // Pilih aset relevan
  const targetAssets = filter === 'all'
    ? assets
    : assets.filter((a) => a.id === filter)
  if (targetAssets.length === 0) return []

  // Trades relevan
  const relevantTrades = trades.filter((t) =>
    targetAssets.some((a) => a.id === t.asset_id),
  )
  if (relevantTrades.length === 0) return []

  // Bulan pertama = bulan dari trade paling awal
  const firstTradeDate = relevantTrades.reduce(
    (m, t) => (t.traded_on < m ? t.traded_on : m),
    relevantTrades[0].traded_on,
  )
  const firstMonth = monthOf(firstTradeDate)
  if (firstMonth > todayMonth) return []
  const allMonths = monthRange(firstMonth, todayMonth)

  // Apply range window
  let months = allMonths
  if (range === 6 || range === 12) {
    months = allMonths.slice(-range)
  }
  if (months.length === 0) return []

  // Per bulan: hitung state semua aset target, lalu agregat
  const points: SeriesPoint[] = []
  // Simpan harga per aset per bulan utk carry-forward
  const lastKnownPrice = new Map<string, number>()

  for (let i = 0; i < months.length; i++) {
    const mk = months[i]
    const endISO = lastDayOfMonth(mk)
    let totalQty = 0
    let totalCost = 0
    let totalValue = 0
    let singlePrice = 0 // dipakai saat filter != 'all'
    let anyEstimate = false

    for (const asset of targetAssets) {
      const assetTrades = relevantTrades.filter((t) => t.asset_id === asset.id)
      if (assetTrades.length === 0) continue
      const { qty, avgCost } = statePerAssetUpTo(assetTrades, endISO)
      const cost = qty * avgCost

      // Tentukan harga
      // Bulan ini: live dulu, lalu avgCost (sama dengan computePosition saat harga null)
      // agar titik terakhir grafik konsisten dengan Ringkasan Portofolio.
      // Bulan lampau: snapshot terdekat, harga implisit dari trade, lalu carry-forward.
      let price: number | null = null
      let quality: PriceQuality = 'estimate'
      if (mk === todayMonth) {
        const live = currentPrices[asset.symbol]
        if (live != null && Number.isFinite(live) && live > 0) {
          price = live
          quality = 'market'
        } else if (avgCost > 0) {
          price = avgCost
          quality = 'estimate'
        }
      } else {
        const snap = priceAtMonthEnd(asset.id, mk, priceHistory)
        if (snap != null && Number.isFinite(snap) && snap > 0) {
          price = snap
          quality = 'market'
        }
        if (price == null) {
          const implicit = implicitPriceAtMonthEnd(asset.id, mk, relevantTrades)
          if (implicit != null && Number.isFinite(implicit) && implicit > 0) {
            price = implicit
            quality = 'estimate'
          }
        }
        if (price == null) {
          const prev = lastKnownPrice.get(asset.id)
          if (prev != null && prev > 0) {
            price = prev
            quality = 'estimate'
          }
        }
      }
      if (price == null) {
        price = 0
        quality = 'estimate'
      }
      if (quality === 'estimate') anyEstimate = true
      lastKnownPrice.set(asset.id, price)

      totalQty += qty
      totalCost += cost
      totalValue += qty * price
      if (filter !== 'all') singlePrice = price
    }

    // mom/momAbs vs titik sebelumnya
    const prev = points[points.length - 1]
    let mom: number | null = null
    let momAbs: number | null = null
    if (prev && prev.value > 0) {
      momAbs = totalValue - prev.value
      mom = momAbs / prev.value
    }

    points.push({
      month: mk,
      qty: totalQty,
      cost: totalCost,
      value: totalValue,
      price: filter === 'all' ? 0 : singlePrice,
      quality: anyEstimate ? 'estimate' : 'market',
      pl: totalValue - totalCost,
      mom,
      momAbs,
    })
  }

  return points
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

// ─────────────────────────────────────────────────────────────────────────────
// contributorShares — porsi kontributor dari nilai portofolio.
//
// Asumsi perhitungan (dokumentasi lengkap di docs/DESIGN.md):
// - Setoran bersih = total beli (qty*price+fee) dikurangi total jual (qty*price-fee).
// - Porsi dihitung dari setoran bersih masing-masing kontributor dibagi total setoran
//   bersih semua kontributor (termasuk "Tanpa nama").
// - Jika setoran bersih seseorang negatif (jual lebih banyak dari beli), porsinya 0%.
// - Nilai bagian = porsi * portfolioValue.
// - Untung/rugi bagian = nilai bagian - setoran bersih.
// - Jika total setoran bersih 0, semua porsi 0%.
// ─────────────────────────────────────────────────────────────────────────────

export interface ContributorShare {
  contributorId: string | null  // null = tanpa nama
  name: string
  netDeposit: number      // setoran bersih (beli - jual)
  sharePct: number        // porsi 0–1
  shareValue: number      // porsi * portfolioValue
  sharePL: number         // shareValue - netDeposit
  capped: boolean         // true jika netDeposit negatif → porsi diset ke 0
}

interface TradeForShare {
  side: 'buy' | 'sell'
  quantity: number
  price_per_unit: number
  fee: number
  contributor_id?: string | null
}

interface ContributorForShare {
  id: string
  name: string
}

export function contributorShares(
  trades: TradeForShare[],
  contributors: ContributorForShare[],
  portfolioValue: number,
): ContributorShare[] {
  // Kelompokkan berdasarkan contributor_id (null = tanpa nama)
  const depositMap = new Map<string | null, number>()

  for (const t of trades) {
    const cid = t.contributor_id ?? null
    const cost =
      t.side === 'buy'
        ? t.quantity * t.price_per_unit + t.fee
        : -(t.quantity * t.price_per_unit - t.fee)
    depositMap.set(cid, (depositMap.get(cid) ?? 0) + cost)
  }

  // Kumpulkan semua kontributor unik yang muncul dalam trades
  const allIds = new Set<string | null>(depositMap.keys())
  const contribById = new Map(contributors.map((c) => [c.id, c]))

  // Hitung total setoran bersih positif (denominator untuk porsi)
  let totalPositiveDeposit = 0
  for (const [, dep] of depositMap) {
    if (dep > 0) totalPositiveDeposit += dep
  }

  const shares: ContributorShare[] = []
  for (const cid of allIds) {
    const netDeposit = depositMap.get(cid) ?? 0
    const capped = netDeposit <= 0
    const rawDeposit = capped ? 0 : netDeposit
    const sharePct = totalPositiveDeposit > 0 ? rawDeposit / totalPositiveDeposit : 0
    const shareValue = sharePct * portfolioValue
    const name = cid == null ? 'Tanpa nama' : (contribById.get(cid)?.name ?? 'Tanpa nama')
    shares.push({
      contributorId: cid,
      name,
      netDeposit,
      sharePct,
      shareValue,
      sharePL: shareValue - rawDeposit,
      capped,
    })
  }

  // Urutkan: kontributor bernama dulu (urut nama), lalu tanpa nama
  shares.sort((a, b) => {
    if (a.contributorId === null) return 1
    if (b.contributorId === null) return -1
    return a.name.localeCompare(b.name, 'id')
  })

  return shares
}
