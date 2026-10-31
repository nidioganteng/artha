// Uji cepat kalkulasi investasi. Jalankan: npm run check:calc
import { computePosition, flowsOf, summarize, xirr } from '../src/lib/calc'

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

console.log(failed === 0 ? '\nSemua uji lolos.' : `\n${failed} uji gagal.`)
process.exit(failed === 0 ? 0 : 1)
