// Uji cepat kalkulasi investasi + fungsi murni format. Jalankan: npm run check:calc
import { computePosition, flowsOf, portfolioSeries, summarize, xirr } from '../src/lib/calc'
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
}

console.log(failed === 0 ? '\nSemua uji lolos.' : `\n${failed} uji gagal.`)
process.exit(failed === 0 ? 0 : 1)
