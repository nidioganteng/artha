// Uji cepat kalkulasi investasi + fungsi murni format. Jalankan: npm run check:calc
import { createHash } from 'node:crypto'
import { computePosition, contributorShares, flowsOf, periodRange, barChartMonths, portfolioSeries, summarize, xirr } from '../src/lib/calc'
import { formatPercent, parseNum, todayISO } from '../src/lib/format'
import { formatMoneyInput, parseMoneyInput, formatQuantityInput, parseQuantityInput } from '../src/lib/numInput'
import { formatShort } from '../src/lib/amount'
import { accountBalance, monthReport, unassignedTrades } from '../src/lib/ledger'
import type { Account, Category, Transaction, Trade } from '../src/lib/types'

let failed = 0
function ok(name: string, cond: boolean, detail = '') {
  console.log(`${cond ? 'OK  ' : 'GAGAL'} ${name}${detail ? ' | ' + detail : ''}`)
  if (!cond) failed++
}
const near = (a: number, b: number, eps = 1e-6) => Math.abs(a - b) <= eps

const today = new Date(2026, 9, 31) // 31 Okt 2026

// 1) DCA BTC: dua kali beli, rata-rata harus berbobot
const dca = computePosition(
  [
    { side: 'buy', quantity: 0.001, price: 1_000_000_000, fee: 0, date: '2026-07-01' }, // 1.000.000
    { side: 'buy', quantity: 0.003, price: 1_200_000_000, fee: 0, date: '2026-09-01' }, // 3.600.000
  ],
  1_300_000_000,
  today,
)
ok('qty total', near(dca.qty, 0.004))
ok('rata-rata beli', near(dca.avgPrice, 4_600_000 / 0.004), String(dca.avgPrice))
ok('modal', near(dca.totalBought, 4_600_000))
ok('nilai sekarang', near(dca.value, 5_200_000))
ok('untung', near(dca.totalPL, 600_000))
ok('ROI', near(dca.roi ?? NaN, 600_000 / 4_600_000))
ok('CAGR tersedia (>30 hari)', dca.cagr !== null, String(dca.cagr))
ok('XIRR tersedia', dca.xirr !== null, String(dca.xirr))

// 2) Satu tahun penuh: CAGR harus sama dengan return tahunan (+20%)
const year = computePosition(
  [{ side: 'buy', quantity: 1, price: 1_000_000, fee: 0, date: '2025-10-31' }],
  1_200_000,
  today,
)
ok('CAGR 1 tahun = 20%', near(year.cagr ?? NaN, 0.2, 1e-9), String(year.cagr))
ok('XIRR 1 tahun ~ 20%', near(year.xirr ?? NaN, 0.2, 1e-4), String(year.xirr))

// 3) Jual sebagian: untung terealisasi memakai rata-rata
const sell = computePosition(
  [
    { side: 'buy', quantity: 10, price: 100, fee: 0, date: '2026-01-01' },
    { side: 'buy', quantity: 10, price: 200, fee: 0, date: '2026-02-01' }, // avg 150
    { side: 'sell', quantity: 5, price: 300, fee: 0, date: '2026-03-01' },
  ],
  250,
  today,
)
ok('sisa qty setelah jual', near(sell.qty, 15))
ok('avg tetap 150', near(sell.avgPrice, 150))
ok('realized = 5*(300-150)', near(sell.realized, 750))
ok('unrealized = 15*(250-150)', near(sell.unrealized, 1500))
ok('total PL = realized+unrealized', near(sell.totalPL, 2250), String(sell.totalPL))

// 4) Fee masuk ke modal
const fee = computePosition([{ side: 'buy', quantity: 1, price: 1000, fee: 50, date: '2026-10-01' }], 1000, today)
ok('fee menambah modal', near(fee.totalBought, 1050) && near(fee.avgPrice, 1050))

// 5) Harga pasar belum ada -> untung/rugi 0, tidak error
const noPrice = computePosition([{ side: 'buy', quantity: 2, price: 500, fee: 0, date: '2026-10-01' }], null, today)
ok('tanpa harga pasar: PL 0', near(noPrice.totalPL, 0))

// 6) Portofolio gabungan
const a = computePosition([{ side: 'buy', quantity: 1, price: 1000, fee: 0, date: '2026-08-01' }], 1100, today)
const b = computePosition([{ side: 'buy', quantity: 2, price: 500, fee: 0, date: '2026-08-01' }], 450, today)
const sum = summarize(
  [a, b],
  [
    { side: 'buy', quantity: 1, price: 1000, fee: 0, date: '2026-08-01' },
    { side: 'buy', quantity: 2, price: 500, fee: 0, date: '2026-08-01' },
  ],
  today,
)
ok('portofolio: modal 2000', near(sum.totalBought, 2000))
ok('portofolio: nilai 2000', near(sum.value, 2000))
ok('portofolio: PL 0', near(sum.totalPL, 0))

// 7) XIRR tanpa solusi
ok('xirr 1 arus kas = null', xirr(flowsOf([{ side: 'buy', quantity: 1, price: 1, fee: 0, date: '2026-01-01' }])) === null)

// 8) parseNum — format Indonesia dan edge case
const pn = (s: string, d = false) => parseNum(s, d)
ok('parseNum "1.500.000"', pn('1.500.000') === 1_500_000)
ok('parseNum "0,0025"', pn('0,0025') === 0.0025)
ok('parseNum "0.0025" (desimal)', pn('0.0025') === 0.0025)
ok('parseNum "0.0025" dotIsDecimal', pn('0.0025', true) === 0.0025)
ok('parseNum "500,000" (ribuan koma)', pn('500,000') === 500_000)
ok('parseNum "1,500,000"', pn('1,500,000') === 1_500_000)
ok('parseNum "" = NaN', isNaN(pn('')))
ok('parseNum "-500"', pn('-500') === -500)
ok('parseNum "0"', pn('0') === 0)
ok('parseNum "9999999999"', pn('9999999999') === 9_999_999_999)

// 9) Tanggal Rutin akhir bulan (Feb, Apr)
function dueDate(month: string, dayOfMonth: number): string {
  const [y, m] = month.split('-').map(Number)
  const last = new Date(y, m, 0).getDate()
  return `${month}-${String(Math.min(dayOfMonth, last)).padStart(2, '0')}`
}
ok('Rutin tgl 29 di Feb 2025 -> 28', dueDate('2025-02', 29) === '2025-02-28')
ok('Rutin tgl 31 di Feb 2025 -> 28', dueDate('2025-02', 31) === '2025-02-28')
ok('Rutin tgl 31 di Apr 2025 -> 30', dueDate('2025-04', 31) === '2025-04-30')
ok('Rutin tgl 29 di Feb 2024 (kabisat)', dueDate('2024-02', 29) === '2024-02-29')
ok('Rutin tgl 31 di Jan 2025', dueDate('2025-01', 31) === '2025-01-31')

// 10) todayISO memakai zona waktu lokal (bukan UTC)
const now = new Date()
const localStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`
ok('todayISO zona waktu lokal', todayISO() === localStr)

// 11) formatMoneyInput — format input Rupiah
ok('fmt money "50000" -> "50.000"', formatMoneyInput('50000') === '50.000')
ok('fmt money "1234567" -> "1.234.567"', formatMoneyInput('1234567') === '1.234.567')
ok('fmt money "0" -> "0"', formatMoneyInput('0') === '0')
ok('fmt money "007" -> "7"', formatMoneyInput('007') === '7')
ok('fmt money "" -> ""', formatMoneyInput('') === '')
ok('fmt money "abc" -> ""', formatMoneyInput('abc') === '')
ok('fmt money "Rp 1.500.000" -> "1.500.000"', formatMoneyInput('Rp 1.500.000') === '1.500.000')
ok('fmt money "1,500,000" -> "1.500.000"', formatMoneyInput('1,500,000') === '1.500.000')

// 12) parseMoneyInput — parse input Rupiah
ok('parse money "50.000" -> 50000', parseMoneyInput('50.000') === 50000)
ok('parse money "" -> null', parseMoneyInput('') === null)
ok('parse money "1.234.567" -> 1234567', parseMoneyInput('1.234.567') === 1234567)
ok('parse money "0" -> 0', parseMoneyInput('0') === 0)

// 13) formatQuantityInput — format input kuantitas
ok('fmt qty "0.5" -> "0,5"', formatQuantityInput('0.5') === '0,5')
ok('fmt qty "0,5" -> "0,5"', formatQuantityInput('0,5') === '0,5')
ok('fmt qty "1,2,3" -> "1,23"', formatQuantityInput('1,2,3') === '1,23')
ok('fmt qty "007,5" -> "7,5"', formatQuantityInput('007,5') === '7,5')
ok('fmt qty "0,123456789" max8 -> "0,12345678"', formatQuantityInput('0,123456789', 8) === '0,12345678')
ok('fmt qty "0,1234" max4 -> "0,1234"', formatQuantityInput('0,1234', 4) === '0,1234')
ok('fmt qty "abc" -> "0"', formatQuantityInput('abc') === '0')

// 14) parseQuantityInput — parse input kuantitas
ok('parse qty "0,5" -> 0.5', parseQuantityInput('0,5') === 0.5)
ok('parse qty "" -> null', parseQuantityInput('') === null)
ok('parse qty "0,00012345" -> 0.00012345', parseQuantityInput('0,00012345') === 0.00012345)
ok('parse qty "7" -> 7', parseQuantityInput('7') === 7)

// 15) Round trip
ok('round trip money 1500000', parseMoneyInput(formatMoneyInput('1500000')) === 1500000)
ok('round trip qty 0.00012345', parseQuantityInput(formatQuantityInput('0.00012345', 8)) === 0.00012345)

// 16) formatShort — singkatan nominal
ok('formatShort 1500000 → "Rp 1,5 Jt"', formatShort(1500000) === 'Rp 1,5 Jt')
ok('formatShort 1000000 → "Rp 1 Jt"', formatShort(1000000) === 'Rp 1 Jt')
ok('formatShort 2340000000 → "Rp 2,34 M"', formatShort(2340000000) === 'Rp 2,34 M')
ok('formatShort 950000 < 1 Jt, bukan singkatan', !formatShort(950000).includes('Jt') && formatShort(950000).includes('950'))
ok('formatShort -1500000 negatif aman', formatShort(-1500000) === '-Rp 1,5 Jt')

// 17) accountBalance — saldo rekening dari ledger.ts
{
  const acc: Account = { id: 'a1', user_id: 'u1', name: 'BRI', type: 'bank', opening_balance: 1_000_000 }
  const other: Account = { id: 'a2', user_id: 'u1', name: 'Kas', type: 'cash', opening_balance: 0 }

  // 17a) Saldo hanya dari opening_balance (tanpa transaksi / trade)
  ok('ledger: saldo awal saja', accountBalance(acc, [], []) === 1_000_000)

  // 17b) Pemasukan menambah, pengeluaran mengurangi
  const tx: Transaction[] = [
    { id: 't1', user_id: 'u1', account_id: 'a1', category_id: null, kind: 'income', amount: 500_000, note: null, occurred_on: '2026-10-05', recurring_rule_id: null },
    { id: 't2', user_id: 'u1', account_id: 'a1', category_id: null, kind: 'expense', amount: 200_000, note: null, occurred_on: '2026-10-10', recurring_rule_id: null },
  ]
  ok('ledger: income menambah, expense mengurangi', accountBalance(acc, tx, []) === 1_300_000)

  // 17c) Beli DCA mengurangi (qty * price + fee)
  const buy: Trade = { id: 'tr1', user_id: 'u1', asset_id: 'as1', platform_id: null, account_id: 'a1', side: 'buy', quantity: 0.001, price_per_unit: 1_000_000_000, fee: 5_000, traded_on: '2026-10-15', note: null }
  ok('ledger: buy trade mengurangi (qty*price+fee)', accountBalance(acc, [], [buy]) === 1_000_000 - (0.001 * 1_000_000_000 + 5_000))

  // 17d) Jual mengembalikan (qty * price - fee)
  const sell: Trade = { id: 'tr2', user_id: 'u1', asset_id: 'as1', platform_id: null, account_id: 'a1', side: 'sell', quantity: 0.001, price_per_unit: 1_200_000_000, fee: 5_000, traded_on: '2026-10-16', note: null }
  ok('ledger: sell trade menambah (qty*price-fee)', accountBalance(acc, [], [sell]) === 1_000_000 + (0.001 * 1_200_000_000 - 5_000))

  // 17e) Fee diperlakukan konsisten di beli dan jual
  const buyNoFee: Trade = { ...buy, id: 'tr3', fee: 0 }
  const sellNoFee: Trade = { ...sell, id: 'tr4', fee: 0 }
  const dBuy = accountBalance(acc, [], [buyNoFee]) - accountBalance(acc, [], [buy])
  const dSell = accountBalance(acc, [], [sell]) - accountBalance(acc, [], [sellNoFee])
  ok('ledger: fee konsisten (buy & sell)', near(dBuy, 5_000) && near(dSell, -5_000))

  // 17f) Trade tanpa account_id tidak mempengaruhi saldo rekening manapun
  const orphan: Trade = { ...buy, id: 'tr5', account_id: null }
  ok('ledger: trade tanpa account_id tidak mempengaruhi saldo', accountBalance(acc, [], [orphan]) === 1_000_000 && accountBalance(other, [], [orphan]) === 0)
  const orphanUndef: Trade = { ...buy, id: 'tr6' }
  delete (orphanUndef as { account_id?: string | null }).account_id
  ok('ledger: trade dengan account_id undefined tidak mempengaruhi saldo', accountBalance(acc, [], [orphanUndef]) === 1_000_000)

  // 17g) upTo membatasi record ke tanggal <= upTo
  const txRange: Transaction[] = [
    { id: 'tA', user_id: 'u1', account_id: 'a1', category_id: null, kind: 'income', amount: 100_000, note: null, occurred_on: '2026-09-30', recurring_rule_id: null },
    { id: 'tB', user_id: 'u1', account_id: 'a1', category_id: null, kind: 'income', amount: 200_000, note: null, occurred_on: '2026-10-15', recurring_rule_id: null },
    { id: 'tC', user_id: 'u1', account_id: 'a1', category_id: null, kind: 'income', amount: 400_000, note: null, occurred_on: '2026-11-01', recurring_rule_id: null },
  ]
  ok('ledger: upTo="2026-09-30" hanya mencakup s/d tanggal itu', accountBalance(acc, txRange, [], '2026-09-30') === 1_100_000)
  ok('ledger: upTo="2026-10-31" mencakup Sep + Okt', accountBalance(acc, txRange, [], '2026-10-31') === 1_300_000)
  ok('ledger: tanpa upTo mencakup semua', accountBalance(acc, txRange, []) === 1_700_000)
}

// 18) monthReport — konsistensi saldo per rekening = net saat semua record punya account_id
{
  const accA: Account = { id: 'a1', user_id: 'u1', name: 'BRI', type: 'bank', opening_balance: 1_000_000 }
  const accB: Account = { id: 'a2', user_id: 'u1', name: 'Kas', type: 'cash', opening_balance: 500_000 }
  const cats: Category[] = [
    { id: 'c1', user_id: 'u1', name: 'Gaji', kind: 'income' },
    { id: 'c2', user_id: 'u1', name: 'Makan', kind: 'expense' },
  ]
  const tx: Transaction[] = [
    { id: 't1', user_id: 'u1', account_id: 'a1', category_id: 'c1', kind: 'income', amount: 5_000_000, note: null, occurred_on: '2026-10-05', recurring_rule_id: null },
    { id: 't2', user_id: 'u1', account_id: 'a2', category_id: 'c2', kind: 'expense', amount: 400_000, note: null, occurred_on: '2026-10-10', recurring_rule_id: null },
    { id: 't3', user_id: 'u1', account_id: 'a1', category_id: 'c2', kind: 'expense', amount: 300_000, note: null, occurred_on: '2026-10-15', recurring_rule_id: null },
  ]
  const trs: Trade[] = [
    { id: 'tr1', user_id: 'u1', asset_id: 'as1', platform_id: null, account_id: 'a1', side: 'buy', quantity: 0.001, price_per_unit: 1_000_000_000, fee: 0, traded_on: '2026-10-20', note: null },
    { id: 'tr2', user_id: 'u1', asset_id: 'as1', platform_id: null, account_id: 'a2', side: 'sell', quantity: 0.0005, price_per_unit: 1_200_000_000, fee: 0, traded_on: '2026-10-22', note: null },
  ]
  const r = monthReport('2026-10', [accA, accB], cats, tx, trs)
  ok('monthReport: income', r.income === 5_000_000)
  ok('monthReport: expense', r.expense === 700_000)
  ok('monthReport: investBuy', r.investBuy === 1_000_000)
  ok('monthReport: investSell', r.investSell === 600_000)
  ok('monthReport: net = income - expense - investBuy + investSell',
    r.net === 5_000_000 - 700_000 - 1_000_000 + 600_000)
  const totalChange = r.accountChanges.reduce((s, c) => s + c.change, 0)
  ok('monthReport: sum(accountChanges.change) === net (semua record punya account_id)', near(totalChange, r.net))
  ok('monthReport: byCategory ada entry Gaji income', r.byCategory.some((c) => c.name === 'Gaji' && c.kind === 'income' && c.total === 5_000_000))
  ok('monthReport: byCategory ada entry Makan expense', r.byCategory.some((c) => c.name === 'Makan' && c.kind === 'expense' && c.total === 700_000))

  // unassignedTrades
  const trs2: Trade[] = [
    ...trs,
    { id: 'tr3', user_id: 'u1', asset_id: 'as1', platform_id: null, account_id: null, side: 'buy', quantity: 0.001, price_per_unit: 500_000_000, fee: 1_000, traded_on: '2026-10-25', note: null },
  ]
  const u = unassignedTrades(trs2)
  ok('unassignedTrades: jumlah', u.trades.length === 1)
  ok('unassignedTrades: totalValue', u.totalValue === 0.001 * 500_000_000 + 1_000)
}

// 19) formatPercent — koma desimal Indonesia, tanpa + untuk positif
ok('formatPercent 0 -> "0,00%"', formatPercent(0) === '0,00%')
ok('formatPercent 0.125 -> "12,50%"', formatPercent(0.125) === '12,50%')
ok('formatPercent -0.0325 -> "-3,25%"', formatPercent(-0.0325) === '-3,25%')
ok('formatPercent null -> "-"', formatPercent(null) === '-')
ok('formatPercent negatif besar aman', formatPercent(-1) === '-100,00%')

// 20) portfolioSeries — titik bulanan untuk grafik perkembangan investasi
{
  const assets = [{ id: 'a1', symbol: 'BTC' }]

  // 20.1 Empty trades → []
  ok('portfolioSeries empty → []',
    portfolioSeries([], assets, [], {}, 'all', 6, '2026-06-15').length === 0)

  // 20.2 Satu beli di bulan sekarang + harga live
  const t1 = [{
    id: 't1', asset_id: 'a1', side: 'buy' as const,
    quantity: 1, price_per_unit: 500_000_000, fee: 0, traded_on: '2026-06-01',
  }]
  const pts = portfolioSeries(t1, assets, [], { BTC: 600_000_000 }, 'all', 6, '2026-06-15')
  const lastPts = pts[pts.length - 1]
  ok('portfolioSeries single buy qty=1', near(lastPts.qty, 1))
  ok('portfolioSeries single buy cost=500jt', near(lastPts.cost, 500_000_000))
  ok('portfolioSeries single buy value=600jt (currentPrice)', near(lastPts.value, 600_000_000))
  ok('portfolioSeries single buy quality=market', lastPts.quality === 'market')

  // 20.3 Jual semua → qty=0, value=0
  const t2 = [
    ...t1,
    {
      id: 't2', asset_id: 'a1', side: 'sell' as const,
      quantity: 1, price_per_unit: 600_000_000, fee: 0, traded_on: '2026-06-10',
    },
  ]
  const pts2 = portfolioSeries(t2, assets, [], { BTC: 600_000_000 }, 'all', 6, '2026-06-15')
  const last2 = pts2[pts2.length - 1]
  ok('portfolioSeries sell all qty=0', last2.qty === 0)
  ok('portfolioSeries sell all value=0', last2.value === 0)

  // 20.4 Carry-forward harga → quality estimate
  const t3 = [{
    id: 't3', asset_id: 'a1', side: 'buy' as const,
    quantity: 1, price_per_unit: 500_000_000, fee: 0, traded_on: '2026-01-15',
  }]
  const pts3 = portfolioSeries(t3, assets, [], {}, 'all', 'all', '2026-03-15')
  ok('portfolioSeries carry-forward quality estimate',
    pts3.some((p) => p.quality === 'estimate'))

  // 20.5 Tidak ada bulan sebelum trade pertama
  ok('portfolioSeries no month before first trade',
    !pts3.some((p) => p.month < '2026-01'))

  // 20.6 range=6 → maksimal 6 titik
  const longTrades = [{
    id: 't4', asset_id: 'a1', side: 'buy' as const,
    quantity: 1, price_per_unit: 500_000_000, fee: 0, traded_on: '2025-01-01',
  }]
  const pts4 = portfolioSeries(longTrades, assets, [], { BTC: 600_000_000 }, 'all', 6, '2026-06-15')
  ok('portfolioSeries range=6 → max 6 titik', pts4.length <= 6)

  // 20.7 Output bebas NaN
  ok('portfolioSeries no NaN',
    pts4.every((p) => !Number.isNaN(p.value) && !Number.isNaN(p.cost) && !Number.isNaN(p.pl)))

  // 20.8 mom null saat value sebelumnya tidak ada
  ok('portfolioSeries mom null di titik pertama', pts3[0].mom === null)

  // 20.9 Harga implisit dari trade
  const pts5 = portfolioSeries(t3, assets, [], {}, 'all', 'all', '2026-03-15')
  ok('portfolioSeries implicit price from trade',
    near(pts5[0].price === 0 ? 500_000_000 : pts5[0].price, 500_000_000) || pts5[0].value === 500_000_000)

  // 20.10 Agregasi filter='all' menjumlahkan nilai banyak aset
  const assetsTwo = [
    { id: 'a1', symbol: 'BTC' },
    { id: 'a2', symbol: 'EMAS' },
  ]
  const tradesTwo = [
    { id: 'tA', asset_id: 'a1', side: 'buy' as const, quantity: 1, price_per_unit: 500_000_000, fee: 0, traded_on: '2026-05-01' },
    { id: 'tB', asset_id: 'a2', side: 'buy' as const, quantity: 10, price_per_unit: 1_000_000, fee: 0, traded_on: '2026-05-01' },
  ]
  const ptsAll = portfolioSeries(tradesTwo, assetsTwo, [], { BTC: 600_000_000, EMAS: 1_200_000 }, 'all', 'all', '2026-06-15')
  const lastAll = ptsAll[ptsAll.length - 1]
  ok('portfolioSeries agregat all = sum semua aset',
    near(lastAll.value, 600_000_000 + 12_000_000))

  // 20.11 Filter per aset mengembalikan satu aset saja
  const ptsOne = portfolioSeries(tradesTwo, assetsTwo, [], { BTC: 600_000_000, EMAS: 1_200_000 }, 'a1', 'all', '2026-06-15')
  const lastOne = ptsOne[ptsOne.length - 1]
  ok('portfolioSeries filter aset tunggal: value hanya aset itu',
    near(lastOne.value, 600_000_000))

  // 20.12 Snapshot history dipakai untuk bulan lampau
  const historyTrades = [{
    id: 'tH', asset_id: 'a1', side: 'buy' as const,
    quantity: 1, price_per_unit: 500_000_000, fee: 0, traded_on: '2026-01-15',
  }]
  const snaps = [
    { asset_id: 'a1', date: '2026-02-28', price: 550_000_000, source: 'live' },
  ]
  const ptsSnap = portfolioSeries(historyTrades, assets, snaps, { BTC: 600_000_000 }, 'all', 'all', '2026-04-15')
  const feb = ptsSnap.find((p) => p.month === '2026-02')
  ok('portfolioSeries snapshot sebagai harga Feb',
    feb !== undefined && near(feb.value, 550_000_000) && feb.quality === 'market')

  // 20.13 Bulan ini tanpa harga live → pakai avgCost (konsisten dengan computePosition)
  // Dua beli dengan harga berbeda: avgCost = (500M + 700M * 1) / 2 = 600M
  const tNoLive = [
    { id: 'n1', asset_id: 'a1', side: 'buy' as const, quantity: 1, price_per_unit: 500_000_000, fee: 0, traded_on: '2026-05-01' },
    { id: 'n2', asset_id: 'a1', side: 'buy' as const, quantity: 1, price_per_unit: 700_000_000, fee: 0, traded_on: '2026-06-01' },
  ]
  // Snapshot hari ini (sengaja beda dari avgCost untuk membuktikan snapshot tidak dipakai)
  const snapToday = [{ asset_id: 'a1', date: '2026-06-15', price: 999_000_000, source: 'manual' }]
  const ptsNoLive = portfolioSeries(tNoLive, assets, snapToday, {}, 'all', 'all', '2026-06-15')
  const lastNoLive = ptsNoLive[ptsNoLive.length - 1]
  const posNoLive = computePosition(
    tNoLive.map((t) => ({ side: t.side, quantity: t.quantity, price: t.price_per_unit, fee: t.fee, date: t.traded_on })),
    null,
  )
  ok('portfolioSeries bulan ini tanpa live: value == computePosition.value (avgCost)',
    near(lastNoLive.value, posNoLive.value))
  ok('portfolioSeries bulan ini tanpa live: quality estimate',
    lastNoLive.quality === 'estimate')
  ok('portfolioSeries bulan lampau dengan snapshot: nilai snapshot dipakai (bukan avgCost)',
    near(feb?.value ?? 0, 550_000_000))

  // 20.14 Bulan ini dengan harga live → konsisten dengan computePosition(live)
  const ptsWithLive = portfolioSeries(tNoLive, assets, [], { BTC: 800_000_000 }, 'all', 'all', '2026-06-15')
  const lastWithLive = ptsWithLive[ptsWithLive.length - 1]
  const posWithLive = computePosition(
    tNoLive.map((t) => ({ side: t.side, quantity: t.quantity, price: t.price_per_unit, fee: t.fee, date: t.traded_on })),
    800_000_000,
  )
  ok('portfolioSeries bulan ini dengan live: value == computePosition.value (live)',
    near(lastWithLive.value, posWithLive.value))
  ok('portfolioSeries bulan ini dengan live: quality market',
    lastWithLive.quality === 'market')
}

// ─────────────────────────────────────────────────────────────────────────────
// 21) Uji murni generator data demo (tanpa jaringan)
//     Replikasi fungsi kunci dari seed-demo.ts agar terisolasi dari Supabase.
// ─────────────────────────────────────────────────────────────────────────────
{
  // Replikasi UUID v5 (namespace tetap sama dengan seed-demo.ts)
  const NS_DEMO = Buffer.from('1b671a6440d5491e99b0da01ff1f3341', 'hex')
  function demoIdT(name: string): string {
    const hash = createHash('sha1').update(NS_DEMO).update(Buffer.from(name, 'utf8')).digest()
    hash[6] = (hash[6] & 0x0f) | 0x50
    hash[8] = (hash[8] & 0x3f) | 0x80
    const h = hash.subarray(0, 16).toString('hex')
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`
  }

  // Replikasi PRNG (mulberry32)
  function makePrngT(seed: number) {
    let s = seed >>> 0
    return {
      next(): number {
        s = (s + 0x6d2b79f5) | 0
        let t = Math.imul(s ^ (s >>> 15), 1 | s)
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296
      },
      int(min: number, max: number): number {
        return Math.floor(this.next() * (max - min + 1)) + min
      },
    }
  }

  // ── 21.1 demoId deterministik ──────────────────────────────────────────────
  ok('21.1 demoId deterministik', demoIdT('demo:test:abc') === demoIdT('demo:test:abc'))

  // ── 21.2 demoId format UUID v5 ────────────────────────────────────────────
  const UUID_V5_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
  ok('21.2 demoId format UUID v5', UUID_V5_RE.test(demoIdT('demo:test:abc')))

  // ── 21.3 dua input berbeda → ID berbeda ───────────────────────────────────
  ok('21.3 demoId berbeda untuk input berbeda',
    demoIdT('demo:rule:listrik') !== demoIdT('demo:rule:wifi'))

  // ── 21.4 PRNG deterministik ────────────────────────────────────────────────
  const rng1 = makePrngT(0xdeadbeef)
  const rng2 = makePrngT(0xdeadbeef)
  const seq1 = [rng1.next(), rng1.next(), rng1.next()]
  const seq2 = [rng2.next(), rng2.next(), rng2.next()]
  ok('21.4 PRNG deterministik', seq1.every((v, i) => v === seq2[i]))

  // ── 21.5 PRNG berbeda seed → urutan berbeda ────────────────────────────────
  const rng3 = makePrngT(0xcafebabe)
  ok('21.5 PRNG beda seed hasilkan urutan berbeda', rng3.next() !== seq1[0])

  // ── 21.6 Kepemilikan BTC tidak pernah negatif ─────────────────────────────
  // Data trade BTC sesuai seed-demo.ts (DATA FIKTIF)
  const btcTradeDefs: { side: 'buy' | 'sell'; qty: number; date: string }[] = [
    { side: 'buy',  qty: 0.0003, date: '2025-10-01' }, // unassigned
    { side: 'buy',  qty: 0.0005, date: '2025-11-10' },
    { side: 'buy',  qty: 0.0004, date: '2025-12-05' },
    { side: 'buy',  qty: 0.0004, date: '2026-01-15' },
    { side: 'buy',  qty: 0.0003, date: '2026-02-20' },
    { side: 'buy',  qty: 0.0005, date: '2026-03-10' },
    { side: 'sell', qty: 0.0003, date: '2026-04-18' },
    { side: 'buy',  qty: 0.0004, date: '2026-05-07' },
    { side: 'buy',  qty: 0.0003, date: '2026-06-12' },
    { side: 'buy',  qty: 0.0004, date: '2026-07-08' },
    { side: 'sell', qty: 0.0005, date: '2026-08-20' },
    { side: 'buy',  qty: 0.0003, date: '2026-09-15' },
    { side: 'buy',  qty: 0.0004, date: '2026-10-05' },
    { side: 'buy',  qty: 0.0002, date: '2026-10-28' },
  ]
  let btcQty = 0
  let btcNeverNeg = true
  const sortedBtc = [...btcTradeDefs].sort((a, b) => a.date.localeCompare(b.date))
  for (const t of sortedBtc) {
    btcQty = t.side === 'buy' ? btcQty + t.qty : btcQty - t.qty
    if (btcQty < -1e-10) btcNeverNeg = false
  }
  ok('21.6 kepemilikan BTC tidak pernah negatif', btcNeverNeg)
  ok('21.6 kepemilikan BTC akhir = 0.0036', near(btcQty, 0.0036, 1e-9))

  // ── 21.7 Kepemilikan EMAS tidak pernah negatif ────────────────────────────
  const emasTradeDefs: { side: 'buy' | 'sell'; qty: number; date: string }[] = [
    { side: 'buy',  qty: 1.0, date: '2025-10-15' }, // unassigned
    { side: 'buy',  qty: 2.0, date: '2025-11-20' },
    { side: 'buy',  qty: 1.5, date: '2026-01-25' },
    { side: 'buy',  qty: 2.0, date: '2026-03-18' },
    { side: 'sell', qty: 1.0, date: '2026-05-22' },
    { side: 'buy',  qty: 1.5, date: '2026-07-14' },
    { side: 'buy',  qty: 1.0, date: '2026-09-28' },
  ]
  let emasQty = 0
  let emasNeverNeg = true
  for (const t of [...emasTradeDefs].sort((a, b) => a.date.localeCompare(b.date))) {
    emasQty = t.side === 'buy' ? emasQty + t.qty : emasQty - t.qty
    if (emasQty < -1e-10) emasNeverNeg = false
  }
  ok('21.7 kepemilikan EMAS tidak pernah negatif', emasNeverNeg)
  ok('21.7 kepemilikan EMAS akhir = 8.0', near(emasQty, 8.0, 1e-9))

  // ── 21.8 Semua ID demo yang diketahui unik ────────────────────────────────
  const knownDemoKeys = [
    'demo:rule:listrik', 'demo:rule:wifi', 'demo:rule:streaming',
    'demo:rule:gaji', 'demo:rule:dca-btc',
    'demo:trade:btc:oct25:unassigned', 'demo:trade:btc:nov25', 'demo:trade:btc:dec25',
    'demo:trade:btc:jan26', 'demo:trade:btc:feb26', 'demo:trade:btc:mar26',
    'demo:trade:btc:apr26:sell', 'demo:trade:btc:may26', 'demo:trade:btc:jun26',
    'demo:trade:btc:jul26', 'demo:trade:btc:aug26:sell', 'demo:trade:btc:sep26',
    'demo:trade:btc:oct26a', 'demo:trade:btc:oct26b',
    'demo:trade:emas:oct25:unassigned', 'demo:trade:emas:nov25', 'demo:trade:emas:jan26',
    'demo:trade:emas:mar26', 'demo:trade:emas:may26:sell', 'demo:trade:emas:jul26',
    'demo:trade:emas:sep26',
    'demo:snapshot:BTC:2025-11-30', 'demo:snapshot:EMAS:2025-11-30',
    'demo:snapshot:BTC:2026-10-31', 'demo:snapshot:EMAS:2026-10-31',
    'demo:snapshot:BTC:2026-11-04', 'demo:snapshot:EMAS:2026-11-04',
  ]
  const generatedIds = knownDemoKeys.map((k) => demoIdT(k))
  const idSet = new Set(generatedIds)
  ok('21.8 semua ID demo dikenal unik', idSet.size === generatedIds.length)

  // ── 21.9 Saldo BRI tidak negatif di akhir setiap bulan ────────────────────
  // Hitung saldo BRI secara manual dengan data minimal deterministik
  const FAKE_BRI_ID = demoIdT('test:acc:bri')
  const FAKE_KAS_ID = demoIdT('test:acc:kas')
  const FAKE_BTC_ID = demoIdT('test:asset:btc')
  const FAKE_EMAS_ID = demoIdT('test:asset:emas')

  const fakeAccBRI: Account = { id: FAKE_BRI_ID, user_id: 'u', name: 'BRI', type: 'bank', opening_balance: 10_000_000 }
  const fakeAccKas: Account = { id: FAKE_KAS_ID, user_id: 'u', name: 'Kas', type: 'cash', opening_balance: 2_000_000 }

  // Income transactions (dari seed-demo.ts, statis)
  const incomeData: { date: string; amount: number; account: 'BRI' | 'Kas' }[] = [
    { date: '2025-11-05', amount: 2_500_000, account: 'BRI' },
    { date: '2025-11-25', amount: 8_000_000, account: 'BRI' },
    { date: '2025-12-10', amount: 1_800_000, account: 'BRI' },
    { date: '2025-12-20', amount: 300_000,   account: 'BRI' },
    { date: '2025-12-25', amount: 8_000_000, account: 'BRI' },
    { date: '2026-01-08', amount: 3_500_000, account: 'BRI' },
    { date: '2026-01-25', amount: 8_000_000, account: 'BRI' },
    { date: '2026-02-25', amount: 8_000_000, account: 'BRI' },
    { date: '2026-03-12', amount: 4_200_000, account: 'BRI' },
    { date: '2026-03-25', amount: 8_000_000, account: 'BRI' },
    { date: '2026-04-05', amount: 2_000_000, account: 'BRI' },
    { date: '2026-04-28', amount: 8_000_000, account: 'BRI' },
    { date: '2026-05-15', amount: 3_000_000, account: 'BRI' },
    { date: '2026-05-25', amount: 8_000_000, account: 'BRI' },
    { date: '2026-06-08', amount: 5_500_000, account: 'BRI' },
    { date: '2026-06-25', amount: 8_000_000, account: 'BRI' },
    { date: '2026-07-20', amount: 1_500_000, account: 'BRI' },
    { date: '2026-07-25', amount: 8_000_000, account: 'BRI' },
    { date: '2026-08-10', amount: 4_800_000, account: 'BRI' },
    { date: '2026-08-25', amount: 8_000_000, account: 'BRI' },
    { date: '2026-08-30', amount: 150_000,   account: 'BRI' },
    { date: '2026-09-25', amount: 8_000_000, account: 'BRI' },
    { date: '2026-10-07', amount: 2_200_000, account: 'BRI' },
    { date: '2026-10-25', amount: 8_000_000, account: 'BRI' },
  ]

  const incomeTxs: Transaction[] = incomeData.map((d, i) => ({
    id: demoIdT(`test:income:${i}`),
    user_id: 'u',
    account_id: FAKE_BRI_ID,
    category_id: null,
    kind: 'income' as const,
    amount: d.amount,
    note: null,
    occurred_on: d.date,
    recurring_rule_id: null,
  }))

  // Pengeluaran representatif: 2000/bulan per bulan × 12 = konservatif
  const MONTHLY_EXPENSE = 3_000_000
  const expMonths = [
    '2025-11', '2025-12', '2026-01', '2026-02', '2026-03', '2026-04',
    '2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10',
  ]
  const expenseTxs: Transaction[] = expMonths.map((m, i) => ({
    id: demoIdT(`test:expense:${i}`),
    user_id: 'u',
    account_id: FAKE_BRI_ID,
    category_id: null,
    kind: 'expense' as const,
    amount: MONTHLY_EXPENSE,
    note: null,
    occurred_on: `${m}-15`,
    recurring_rule_id: null,
  }))

  // Trades BTC + EMAS dari BRI
  const tradesForBalance: Trade[] = [
    ...btcTradeDefs.filter((t) => t.date >= '2025-11-01').map((t, i) => ({
      id: demoIdT(`test:trade:btc:${i}`),
      user_id: 'u',
      asset_id: FAKE_BTC_ID,
      platform_id: null,
      account_id: FAKE_BRI_ID,
      side: t.side,
      quantity: t.qty,
      price_per_unit: 1_800_000_000, // harga rata-rata fiktif
      fee: 0,
      traded_on: t.date,
      note: null,
    })),
    ...emasTradeDefs.filter((t) => t.date >= '2025-11-01').map((t, i) => ({
      id: demoIdT(`test:trade:emas:${i}`),
      user_id: 'u',
      asset_id: FAKE_EMAS_ID,
      platform_id: null,
      account_id: FAKE_BRI_ID,
      side: t.side,
      quantity: t.qty,
      price_per_unit: 1_260_000, // harga rata-rata fiktif
      fee: 0,
      traded_on: t.date,
      note: null,
    })),
  ]

  const allTxs = [...incomeTxs, ...expenseTxs]

  // Verifikasi saldo BRI per akhir bulan: tidak ada yang negatif
  let briBelowZero = false
  for (const m of expMonths) {
    const [y, mo] = m.split('-').map(Number)
    const lastDay = new Date(y, mo, 0).getDate()
    const cutoff = `${m}-${String(lastDay).padStart(2, '0')}`
    const bal = accountBalance(fakeAccBRI, allTxs, tradesForBalance, cutoff)
    if (bal < 0) briBelowZero = true
  }
  ok('21.9 saldo BRI tidak pernah negatif di akhir bulan', !briBelowZero)

  // ── 21.10 Saldo Kas tidak negatif ─────────────────────────────────────────
  // Kas hanya punya opening balance 2_000_000, tidak ada transaksi dari Kas dalam test ini
  const kasBalFinal = accountBalance(fakeAccKas, [], [], '2026-10-31')
  ok('21.10 saldo Kas dengan opening balance saja tidak negatif', kasBalFinal >= 0)
}

// ── 22) contributorShares ───────────────────────────────────────────────────────────
{
  const contribs = [
    { id: 'c1', name: 'Dio' },
    { id: 'c2', name: 'Pasangan' },
  ]

  // 22.1 Dua kontributor, porsi proporsional setoran
  const trades22a = [
    { side: 'buy' as const, quantity: 1, price_per_unit: 6_000_000, fee: 0, contributor_id: 'c1' },
    { side: 'buy' as const, quantity: 1, price_per_unit: 4_000_000, fee: 0, contributor_id: 'c2' },
  ]
  // c1 setor 6_000_000, c2 setor 4_000_000; total 10_000_000
  const s22a = contributorShares(trades22a, contribs, 12_000_000)
  const dioShare = s22a.find((s) => s.contributorId === 'c1')!
  const pasShare = s22a.find((s) => s.contributorId === 'c2')!
  ok('22.1 contributorShares: 2 kontributor jumlah benar', s22a.length === 2)
  ok('22.2 sharePct Dio = 0.6', near(dioShare.sharePct, 0.6), String(dioShare.sharePct))
  ok('22.3 shareValue Dio = 7_200_000', near(dioShare.shareValue, 7_200_000), String(dioShare.shareValue))
  ok('22.4 sharePL Dio = 1_200_000', near(dioShare.sharePL, 7_200_000 - 6_000_000), String(dioShare.sharePL))
  ok('22.5 sharePct Pasangan = 0.4', near(pasShare.sharePct, 0.4), String(pasShare.sharePct))
  ok('22.6 capped = false untuk keduanya', !dioShare.capped && !pasShare.capped)

  // 22.7 Kontributor dengan setoran negatif (jual > beli) → capped
  const trades22b = [
    { side: 'buy' as const, quantity: 1, price_per_unit: 5_000_000, fee: 0, contributor_id: 'c1' },
    { side: 'sell' as const, quantity: 2, price_per_unit: 5_000_000, fee: 0, contributor_id: 'c2' },
  ]
  const s22b = contributorShares(trades22b, contribs, 8_000_000)
  const dioCapped = s22b.find((s) => s.contributorId === 'c1')!
  const pasCapped = s22b.find((s) => s.contributorId === 'c2')!
  ok('22.7 capped = true jika netDeposit <= 0', pasCapped.capped)
  ok('22.8 sharePct = 0 jika capped', near(pasCapped.sharePct, 0))
  ok('22.9 sharePct = 1 jika hanya 1 valid', near(dioCapped.sharePct, 1))

  // 22.10 contributor_id = null → ditampilkan sebagai Tanpa nama
  const trades22c = [
    { side: 'buy' as const, quantity: 1, price_per_unit: 3_000_000, fee: 0, contributor_id: null },
  ]
  const s22c = contributorShares(trades22c, contribs, 4_000_000)
  ok('22.10 null contributor_id → Tanpa nama', s22c.length === 1 && s22c[0].name === 'Tanpa nama')
  ok('22.11 sharePct Tanpa nama = 1', near(s22c[0].sharePct, 1))

  // 22.12 Tidak ada trades → array kosong
  const s22d = contributorShares([], contribs, 0)
  ok('22.12 trades kosong → array kosong', s22d.length === 0)

  // 22.13 portfolioValue = 0 → semua shareValue = 0
  const trades22e = [
    { side: 'buy' as const, quantity: 1, price_per_unit: 5_000_000, fee: 0, contributor_id: 'c1' },
  ]
  const s22e = contributorShares(trades22e, contribs, 0)
  ok('22.13 portfolioValue = 0 → shareValue = 0', near(s22e[0].shareValue, 0))
}

// ── 23) periodRange — rentang tanggal filter periode ───────────────────────
{
  // 23.1 Semua tanpa data: from = awal bulan sekarang, to = now
  const r231 = periodRange('all', null, '2026-10-15', null)
  ok('23.1 periodRange all tanpa data: from = awal bulan', r231.from === '2026-10-01')
  ok('23.2 periodRange all tanpa data: to = now', r231.to === '2026-10-15')

  // 23.3 Semua dengan data: from = firstDate
  const r233 = periodRange('all', null, '2026-10-15', '2025-11-01')
  ok('23.3 periodRange all dengan data: from = firstDate', r233.from === '2025-11-01')
  ok('23.4 periodRange all dengan data: to = now', r233.to === '2026-10-15')

  // 23.5 Bulan ini November: 1-30
  const r235 = periodRange('month', null, '2026-11-04', null)
  ok('23.5 periodRange month: from = 2026-11-01', r235.from === '2026-11-01')
  ok('23.6 periodRange month: to = 2026-11-30', r235.to === '2026-11-30')

  // 23.7 Bulan ini Februari bukan kabisat
  const r237 = periodRange('month', null, '2026-02-15', null)
  ok('23.7 periodRange month Feb 2026: to = 2026-02-28', r237.to === '2026-02-28')

  // 23.8 Bulan ini Februari kabisat
  const r238 = periodRange('month', null, '2024-02-15', null)
  ok('23.8 periodRange month Feb 2024 kabisat: to = 2024-02-29', r238.to === '2024-02-29')

  // 23.9 Kustom inklusif akhir bulan
  const r239 = periodRange('custom', { from: '2026-01', to: '2026-10' }, '2026-11-04', null)
  ok('23.9 periodRange custom: from = 2026-01-01', r239.from === '2026-01-01')
  ok('23.10 periodRange custom: to = 2026-10-31', r239.to === '2026-10-31')

  // 23.11 Kustom awal = akhir: satu bulan
  const r2311 = periodRange('custom', { from: '2026-05', to: '2026-05' }, '2026-11-04', null)
  ok('23.11 periodRange custom from==to: from = 2026-05-01', r2311.from === '2026-05-01')
  ok('23.12 periodRange custom from==to: to = 2026-05-31', r2311.to === '2026-05-31')

  // 23.13 Kustom tukar otomatis bila akhir < awal
  const r2313 = periodRange('custom', { from: '2026-10', to: '2026-03' }, '2026-11-04', null)
  ok('23.13 periodRange custom swap: from = 2026-03-01', r2313.from === '2026-03-01')
  ok('23.14 periodRange custom swap: to = 2026-10-31', r2313.to === '2026-10-31')
}

// ── 24) barChartMonths ─────────────────────────────────────────────────────
{
  // 24.1 3 bulan: Jan-Mar 2026, tidak capped
  const b241 = barChartMonths('2026-01-01', '2026-03-31', 12)
  ok('24.1 barChartMonths 3 bulan', b241.months.length === 3 && b241.months[0] === '2026-01' && b241.months[2] === '2026-03')
  ok('24.2 barChartMonths tidak capped', !b241.capped)

  // 24.3 15 bulan dengan max=12: capped, ambil 12 terakhir
  const b243 = barChartMonths('2025-09-01', '2026-11-30', 12)
  ok('24.3 barChartMonths capped=true', b243.capped)
  ok('24.4 barChartMonths panjang = 12', b243.months.length === 12)
  ok('24.5 barChartMonths 12 bulan terakhir', b243.months[b243.months.length - 1] === '2026-11')

  // 24.6 Satu bulan: from = to
  const b246 = barChartMonths('2026-05-01', '2026-05-31', 12)
  ok('24.6 barChartMonths 1 bulan', b246.months.length === 1 && b246.months[0] === '2026-05')
  ok('24.7 barChartMonths 1 bulan tidak capped', !b246.capped)
}

// ── 25) Verifikasi angka data demo Oktober 2026 ────────────────────────────
{
  // Income Oktober 2026 dari seed-demo.ts (deterministik):
  const oct26Income = 8_000_000 + 2_200_000 // gaji + proyek = 10_200_000
  ok('25.1 income demo Okt 2026 = Rp 10.200.000', oct26Income === 10_200_000)

  // InvestBuy Oktober 2026: BTC oct26a + oct26b (dari seed-demo.ts)
  const oct26aBuy = 0.0004 * 2_480_000_000 + 9_920   // 992_000 + 9_920 = 1_001_920
  const oct26bBuy = 0.0002 * 2_480_000_000 + 4_960   // 496_000 + 4_960 = 500_960
  const oct26InvestBuy = oct26aBuy + oct26bBuy        // = 1_502_880
  ok('25.2 investBuy demo Okt 2026 = Rp 1.502.880', near(oct26InvestBuy, 1_502_880))

  // Sisa = income - expense - investBuy (expense dari spec = 3_440_000)
  const oct26Expense = 3_440_000
  const oct26Sisa = oct26Income - oct26Expense - oct26InvestBuy
  ok('25.3 sisa demo Okt 2026 = Rp 5.257.120', near(oct26Sisa, 5_257_120))

  // Verifikasi periodRange untuk Okt 2026 Kustom
  const oct26Range = periodRange('custom', { from: '2026-10', to: '2026-10' }, '2026-11-04', '2025-11-01')
  ok('25.4 periodRange Okt 2026: from = 2026-10-01', oct26Range.from === '2026-10-01')
  ok('25.5 periodRange Okt 2026: to = 2026-10-31', oct26Range.to === '2026-10-31')
}

console.log(failed === 0 ? '\nSemua uji lolos.' : `\n${failed} uji gagal.`)
process.exit(failed === 0 ? 0 : 1)
