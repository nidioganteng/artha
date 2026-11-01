// Uji cepat kalkulasi investasi + fungsi murni format. Jalankan: npm run check:calc
import { computePosition, flowsOf, summarize, xirr } from '../src/lib/calc'
import { parseNum, todayISO } from '../src/lib/format'
import { formatMoneyInput, parseMoneyInput, formatQuantityInput, parseQuantityInput } from '../src/lib/numInput'

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

console.log(failed === 0 ? '\nSemua uji lolos.' : `\n${failed} uji gagal.`)
process.exit(failed === 0 ? 0 : 1)
