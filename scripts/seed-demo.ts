/**
 * scripts/seed-demo.ts
 * Pengisi data demo untuk Artha (DATA FIKTIF - bukan data pasar sungguhan).
 *
 * Jalankan:
 *   npx tsx scripts/seed-demo.ts --dry-run
 *   npx tsx scripts/seed-demo.ts --yes
 *   npx tsx scripts/seed-demo.ts --yes --reset
 *
 * Env yang dibutuhkan (muat via node --env-file=.env.local atau export manual):
 *   ARTHA_SEED_EMAIL, ARTHA_SEED_PASSWORD
 *   VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY
 */

import { createHash } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

import { computePosition, portfolioSeries } from '../src/lib/calc'
import { accountBalance } from '../src/lib/ledger'
import type { Account, Category, Transaction, Trade, Asset } from '../src/lib/types'

// ─── Argumen ────────────────────────────────────────────────────────────────

const args = process.argv.slice(2)
const DRY_RUN = args.includes('--dry-run')
const YES = args.includes('--yes')
const RESET = args.includes('--reset')
const FORCE = args.includes('--force-i-know')

if (!DRY_RUN && !YES) {
  console.error('Gunakan --dry-run untuk pratinjau, atau --yes untuk menulis.')
  process.exit(1)
}

// ─── UUID v5 deterministik (tanpa library) ───────────────────────────────────

const NS = Buffer.from('1b671a6440d5491e99b0da01ff1f3341', 'hex')

function demoId(name: string): string {
  const hash = createHash('sha1').update(NS).update(Buffer.from(name, 'utf8')).digest()
  hash[6] = (hash[6] & 0x0f) | 0x50 // version 5
  hash[8] = (hash[8] & 0x3f) | 0x80 // variant 1
  const h = hash.subarray(0, 16).toString('hex')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`
}

// ─── PRNG deterministik (mulberry32) ────────────────────────────────────────

function makePrng(seed: number) {
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
    pick<T>(arr: T[]): T {
      return arr[this.int(0, arr.length - 1)]
    },
    bool(p = 0.5): boolean {
      return this.next() < p
    },
  }
}

// ─── Helpers tanggal ────────────────────────────────────────────────────────

function lastDayOfMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate()
}

function isoDate(year: number, month: number, day: number): string {
  const d = Math.min(day, lastDayOfMonth(year, month))
  return `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

function firstDayOfMonth(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}-01`
}

function lastDayISO(year: number, month: number): string {
  const d = lastDayOfMonth(year, month)
  return `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

// ─── Email masking ───────────────────────────────────────────────────────────

function maskEmail(email: string): string {
  const [local, domain] = email.split('@')
  if (!domain) return '***'
  return `${local.slice(0, 3)}***@${domain}`
}

// ─── Konstanta data demo (DATA FIKTIF) ───────────────────────────────────────

// 12 bulan: Nov 2025 (index 0) sampai Oct 2026 (index 11)
const MONTHS: Array<{ year: number; month: number }> = [
  { year: 2025, month: 11 },
  { year: 2025, month: 12 },
  { year: 2026, month: 1 },
  { year: 2026, month: 2 },
  { year: 2026, month: 3 },
  { year: 2026, month: 4 },
  { year: 2026, month: 5 },
  { year: 2026, month: 6 },
  { year: 2026, month: 7 },
  { year: 2026, month: 8 },
  { year: 2026, month: 9 },
  { year: 2026, month: 10 },
]

// Harga BTC per akhir bulan + hari ini (DATA FIKTIF, bukan harga pasar sungguhan)
const BTC_PRICES = [
  1_480_000_000, 1_620_000_000, 1_750_000_000, 1_890_000_000,
  1_720_000_000, 1_650_000_000, 1_810_000_000, 2_050_000_000,
  2_230_000_000, 2_100_000_000, 2_350_000_000, 2_480_000_000,
  2_520_000_000, // indeks 12 = hari ini 2026-11-04
]

// Harga EMAS per akhir bulan + hari ini (DATA FIKTIF, bukan harga pasar sungguhan)
const EMAS_PRICES = [
  1_195_000, 1_205_000, 1_220_000, 1_230_000, 1_245_000, 1_255_000,
  1_268_000, 1_278_000, 1_290_000, 1_300_000, 1_315_000, 1_325_000,
  1_330_000, // indeks 12 = hari ini
]

const TODAY = '2026-11-04'

// Catatan pendek untuk transaksi pengeluaran
const SHORT_NOTES = [
  'Makan siang', 'Bensin motor', 'Parkir', 'Jajan', 'Ojek online',
  'Makan malam', 'Sarapan', 'Kopi pagi', 'Bayar tagihan', 'Transport ke kantor',
  'Makan bareng teman', 'Belanja mingguan', 'Beli obat', 'Pulsa internet',
  'Parkir motor', 'Nonton bioskop', 'Bayar iuran', 'Beli buku pelajaran',
  'Jajan sore', 'Makan di warteg',
]

// Catatan panjang untuk transaksi pengeluaran
const MEDIUM_NOTES = [
  'Makan malam bersama keluarga di restoran Padang dekat kantor, bayar duluan',
  'Bayar tagihan listrik bulan ini, lebih hemat dari bulan sebelumnya ya',
  'Beli keperluan dapur di supermarket untuk persediaan seminggu ke depan',
  'Bayar langganan streaming bulanan, harga naik sedikit dari bulan sebelumnya',
  'Makan siang di kantin kantor bersama rekan kerja, giliran bayar minggu ini',
  'Transport pulang pergi kantor naik ojek karena motor sedang di bengkel servis',
]

// Catatan tanpa spasi (60 karakter, hanya untuk bulan index 5)
const NOSPACE_NOTE = 'MakansiangdiwarungBuIsahdepanRumahSakitUmumDaerahKabupaten'

// ─── Semua demo ID yang digunakan oleh script ini ────────────────────────────

function allDemoIds(): Set<string> {
  const ids = new Set<string>()

  // Trades BTC
  const btcTradeKeys = [
    'demo:trade:btc:oct25:unassigned', 'demo:trade:btc:nov25', 'demo:trade:btc:dec25',
    'demo:trade:btc:jan26', 'demo:trade:btc:feb26', 'demo:trade:btc:mar26',
    'demo:trade:btc:apr26:sell', 'demo:trade:btc:may26', 'demo:trade:btc:jun26',
    'demo:trade:btc:jul26', 'demo:trade:btc:aug26:sell', 'demo:trade:btc:sep26',
    'demo:trade:btc:oct26a', 'demo:trade:btc:oct26b',
  ]
  btcTradeKeys.forEach((k) => ids.add(demoId(k)))

  // Trades EMAS
  const emasTradeKeys = [
    'demo:trade:emas:oct25:unassigned', 'demo:trade:emas:nov25', 'demo:trade:emas:jan26',
    'demo:trade:emas:mar26', 'demo:trade:emas:may26:sell', 'demo:trade:emas:jul26',
    'demo:trade:emas:sep26',
  ]
  emasTradeKeys.forEach((k) => ids.add(demoId(k)))

  // Recurring rules
  const ruleKeys = [
    'demo:rule:listrik', 'demo:rule:wifi', 'demo:rule:streaming',
    'demo:rule:gaji', 'demo:rule:dca-btc',
  ]
  ruleKeys.forEach((k) => ids.add(demoId(k)))

  // Recurring checks
  const ruleNames = ['listrik', 'wifi', 'streaming', 'gaji', 'dca-btc']
  MONTHS.forEach(({ year, month }) => {
    const ym = `${year}-${String(month).padStart(2, '0')}`
    ruleNames.forEach((r) => ids.add(demoId(`demo:check:${r}:${ym}`)))
  })

  // Price snapshots
  MONTHS.forEach(({ year, month }) => {
    const lastDay = lastDayISO(year, month)
    ids.add(demoId(`demo:snapshot:BTC:${lastDay}`))
    ids.add(demoId(`demo:snapshot:EMAS:${lastDay}`))
  })
  ids.add(demoId(`demo:snapshot:BTC:${TODAY}`))
  ids.add(demoId(`demo:snapshot:EMAS:${TODAY}`))

  // Income transactions
  const incomeTxKeys = [
    'demo:tx:income:2025-11-25:gaji:0', 'demo:tx:income:2025-11-05:proyek:0',
    'demo:tx:income:2025-12-25:gaji:0', 'demo:tx:income:2025-12-10:proyek:0', 'demo:tx:income:2025-12-20:lainnya:0',
    'demo:tx:income:2026-01-25:gaji:0', 'demo:tx:income:2026-01-08:proyek:0',
    'demo:tx:income:2026-02-25:gaji:0',
    'demo:tx:income:2026-03-25:gaji:0', 'demo:tx:income:2026-03-12:proyek:0',
    'demo:tx:income:2026-04-28:gaji:0', 'demo:tx:income:2026-04-05:proyek:0',
    'demo:tx:income:2026-05-25:gaji:0', 'demo:tx:income:2026-05-15:proyek:0',
    'demo:tx:income:2026-06-25:gaji:0', 'demo:tx:income:2026-06-08:proyek:0',
    'demo:tx:income:2026-07-25:gaji:0', 'demo:tx:income:2026-07-20:proyek:0',
    'demo:tx:income:2026-08-25:gaji:0', 'demo:tx:income:2026-08-10:proyek:0', 'demo:tx:income:2026-08-30:lainnya:0',
    'demo:tx:income:2026-09-25:gaji:0',
    'demo:tx:income:2026-10-25:gaji:0', 'demo:tx:income:2026-10-07:proyek:0',
  ]
  incomeTxKeys.forEach((k) => ids.add(demoId(k)))

  // Expense transactions (by month seed)
  MONTHS.forEach(({ year, month }, idx) => {
    const seed = 0xdeadbeef + idx * 1000
    const rng = makePrng(seed)
    const ym = `${year}-${String(month).padStart(2, '0')}`
    const isFeb = idx === 3
    const isBoros = idx === 8

    const countBase = isFeb ? rng.int(20, 25) : isBoros ? rng.int(40, 45) : rng.int(25, 35)

    for (let i = 0; i < countBase; i++) {
      const key = `demo:tx:expense:${ym}:${i}`
      ids.add(demoId(key))
    }

    if (isBoros) {
      ids.add(demoId('demo:tx:expense:2026-07-14:lainnya:boros'))
    }
  })

  return ids
}

// ─── Null safety ─────────────────────────────────────────────────────────────

function must<T>(value: T | undefined | null, msg: string): T {
  if (value == null) {
    console.error(msg)
    process.exit(1)
  }
  return value
}

// ─── Upsert batched ──────────────────────────────────────────────────────────

async function upsertBatched(
  supabase: ReturnType<typeof createClient<any, any, any>>,
  table: string,
  rows: Record<string, unknown>[],
  batchSize = 200,
): Promise<void> {
  if (rows.length === 0) return
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize)
    const batchNum = Math.floor(i / batchSize) + 1
    const { error } = await supabase.from(table).upsert(batch, { onConflict: 'id' })
    if (error) {
      console.error(`Gagal upsert tabel ${table} batch ${batchNum}: ${error.message}`)
      process.exit(1)
    }
  }
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  // Baca env
  const email = process.env.ARTHA_SEED_EMAIL
  const password = process.env.ARTHA_SEED_PASSWORD
  const supabaseUrl = process.env.VITE_SUPABASE_URL
  const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY

  if (!email || !password) {
    console.error('ARTHA_SEED_EMAIL dan ARTHA_SEED_PASSWORD harus diset di environment.')
    process.exit(1)
  }
  if (!supabaseUrl || !supabaseKey) {
    console.error('VITE_SUPABASE_URL dan VITE_SUPABASE_ANON_KEY harus diset di environment.')
    process.exit(1)
  }

  // Buat Supabase client (anon key saja, RLS tetap berlaku)
  const supabase = createClient(supabaseUrl, supabaseKey)

  // Login
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({ email, password })
  if (authError) {
    console.error('Login gagal. Periksa ARTHA_SEED_EMAIL dan ARTHA_SEED_PASSWORD.')
    process.exit(1)
  }
  const userId = must(authData.user, 'Login berhasil tetapi objek user kosong. Periksa konfigurasi Supabase.').id

  // ─── Baca data yang sudah ada dari Supabase ───────────────────────────────

  const [
    { data: dbAccounts },
    { data: dbCategories },
    { data: dbPlatforms },
    { data: dbAssets },
  ] = await Promise.all([
    supabase.from('accounts').select('*'),
    supabase.from('categories').select('*'),
    supabase.from('platforms').select('*'),
    supabase.from('assets').select('*'),
  ])

  const accounts: Account[] = (dbAccounts ?? []) as Account[]
  const categories: Category[] = (dbCategories ?? []) as Category[]

  // Cari account/category/platform/asset yang dibutuhkan
  const MSG_SEED = 'Pastikan trigger seed_new_user sudah berjalan (lihat supabase/schema.sql).'
  const accBRI = must(accounts.find((a) => a.name === 'BRI'), `Rekening 'BRI' tidak ditemukan. ${MSG_SEED}`)
  const accKas = must(accounts.find((a) => a.name === 'Kas'), `Rekening 'Kas' tidak ditemukan. ${MSG_SEED}`)
  const catGaji = must(categories.find((c) => c.name === 'Gaji' && c.kind === 'income'), `Kategori 'Gaji' tidak ditemukan. ${MSG_SEED}`)
  const catProyek = must(categories.find((c) => c.name === 'Proyek / Freelance' && c.kind === 'income'), `Kategori 'Proyek / Freelance' tidak ditemukan. ${MSG_SEED}`)
  const catLainnyaIncome = must(categories.find((c) => c.name === 'Lainnya' && c.kind === 'income'), `Kategori 'Lainnya (pemasukan)' tidak ditemukan. ${MSG_SEED}`)
  const catMakan = must(categories.find((c) => c.name === 'Makan' && c.kind === 'expense'), `Kategori 'Makan' tidak ditemukan. ${MSG_SEED}`)
  const catTransportasi = must(categories.find((c) => c.name === 'Transportasi' && c.kind === 'expense'), `Kategori 'Transportasi' tidak ditemukan. ${MSG_SEED}`)
  const catTagihan = must(categories.find((c) => c.name === 'Tagihan' && c.kind === 'expense'), `Kategori 'Tagihan' tidak ditemukan. ${MSG_SEED}`)
  const catKuliah = must(categories.find((c) => c.name === 'Kuliah' && c.kind === 'expense'), `Kategori 'Kuliah' tidak ditemukan. ${MSG_SEED}`)
  const catHiburan = must(categories.find((c) => c.name === 'Hiburan' && c.kind === 'expense'), `Kategori 'Hiburan' tidak ditemukan. ${MSG_SEED}`)
  const catLainnyaExpense = must(categories.find((c) => c.name === 'Lainnya' && c.kind === 'expense'), `Kategori 'Lainnya (pengeluaran)' tidak ditemukan. ${MSG_SEED}`)

  const platforms = dbPlatforms ?? []
  const platFloq = must((platforms as Array<{ id: string; name: string }>).find((p) => p.name === 'Floq'), `Platform 'Floq' tidak ditemukan. ${MSG_SEED}`)
  const platBRI = must((platforms as Array<{ id: string; name: string }>).find((p) => p.name === 'BRI'), `Platform 'BRI' tidak ditemukan. ${MSG_SEED}`)

  const assets: Asset[] = (dbAssets ?? []) as Asset[]
  const assetBTC = must(assets.find((a) => a.symbol === 'BTC'), `Aset 'BTC' tidak ditemukan. ${MSG_SEED}`)
  const assetEMAS = must(assets.find((a) => a.symbol === 'EMAS'), `Aset 'EMAS' tidak ditemukan. ${MSG_SEED}`)

  // ─── Cek apakah ada data non-demo ────────────────────────────────────────

  if (!DRY_RUN && !FORCE) {
    const demoIds = allDemoIds()

    const [{ data: existingTx }, { data: existingTrades }, { data: existingRules }] = await Promise.all([
      supabase.from('transactions').select('id'),
      supabase.from('trades').select('id'),
      supabase.from('recurring_rules').select('id'),
    ])

    const checkNonDemo = (rows: Array<{ id: string }> | null, label: string) => {
      const nonDemo = (rows ?? []).filter((r) => !demoIds.has(r.id))
      if (nonDemo.length > 0) {
        console.error(`Akun ini sudah berisi data non-demo, skrip dibatalkan (tabel: ${label}, jumlah: ${nonDemo.length}).`)
        console.error('Gunakan --force-i-know jika Anda yakin ingin melanjutkan.')
        process.exit(1)
      }
    }

    checkNonDemo(existingTx ?? [], 'transactions')
    checkNonDemo(existingTrades ?? [], 'trades')
    checkNonDemo(existingRules ?? [], 'recurring_rules')
  }

  // ─── Reset: hapus data demo sebelumnya ───────────────────────────────────

  if (RESET && !DRY_RUN) {
    console.log('Menghapus data demo sebelumnya...')
    const demoIds = [...allDemoIds()]

    // Hapus dalam urutan yang aman (tabel dependen dulu)
    for (const batch of [demoIds.slice(0, 200), demoIds.slice(200), demoIds.slice(400)]) {
      if (batch.length === 0) continue
    }

    // Hapus semua tabel yang mungkin punya demo data
    const tables = ['recurring_checks', 'recurring_rules', 'price_snapshots', 'trades', 'transactions']
    for (const table of tables) {
      const ids = [...allDemoIds()]
      for (let i = 0; i < ids.length; i += 200) {
        const batch = ids.slice(i, i + 200)
        const { error } = await supabase.from(table).delete().in('id', batch)
        if (error && !error.message.includes('no rows')) {
          // Abaikan error "no rows" - berarti baris memang tidak ada
        }
      }
    }
    console.log('Data demo sebelumnya berhasil dihapus.')
  }

  // ─── Siapkan recurring rules ─────────────────────────────────────────────

  const ruleListrikId = demoId('demo:rule:listrik')
  const ruleWifiId = demoId('demo:rule:wifi')
  const ruleStreamingId = demoId('demo:rule:streaming')
  const ruleGajiId = demoId('demo:rule:gaji')
  const ruleDcaBtcId = demoId('demo:rule:dca-btc')

  const recurringRules = [
    {
      id: ruleListrikId, user_id: userId, name: 'Tagihan Listrik', kind: 'expense',
      amount: 150_000, category_id: catTagihan.id, account_id: accBRI.id, day_of_month: 5, active: true,
    },
    {
      id: ruleWifiId, user_id: userId, name: 'Tagihan WiFi', kind: 'expense',
      amount: 200_000, category_id: catTagihan.id, account_id: accBRI.id, day_of_month: 10, active: true,
    },
    {
      id: ruleStreamingId, user_id: userId, name: 'Hiburan Streaming', kind: 'expense',
      amount: 54_000, category_id: catHiburan.id, account_id: accBRI.id, day_of_month: 15, active: true,
    },
    {
      id: ruleGajiId, user_id: userId, name: 'Gaji Bulanan', kind: 'income',
      amount: 8_000_000, category_id: catGaji.id, account_id: accBRI.id, day_of_month: 25, active: true,
    },
    {
      id: ruleDcaBtcId, user_id: userId, name: 'DCA Bitcoin', kind: 'invest',
      amount: 750_000, category_id: null, account_id: accBRI.id, day_of_month: 29, active: true,
    },
  ]

  // ─── Siapkan income transactions ─────────────────────────────────────────

  const incomeData: Array<{ key: string; date: string; catId: string; amount: number; ruleId?: string }> = [
    { key: 'demo:tx:income:2025-11-25:gaji:0', date: '2025-11-25', catId: catGaji.id, amount: 8_000_000, ruleId: ruleGajiId },
    { key: 'demo:tx:income:2025-11-05:proyek:0', date: '2025-11-05', catId: catProyek.id, amount: 2_500_000 },
    { key: 'demo:tx:income:2025-12-25:gaji:0', date: '2025-12-25', catId: catGaji.id, amount: 8_000_000, ruleId: ruleGajiId },
    { key: 'demo:tx:income:2025-12-10:proyek:0', date: '2025-12-10', catId: catProyek.id, amount: 1_800_000 },
    { key: 'demo:tx:income:2025-12-20:lainnya:0', date: '2025-12-20', catId: catLainnyaIncome.id, amount: 300_000 },
    { key: 'demo:tx:income:2026-01-25:gaji:0', date: '2026-01-25', catId: catGaji.id, amount: 8_000_000, ruleId: ruleGajiId },
    { key: 'demo:tx:income:2026-01-08:proyek:0', date: '2026-01-08', catId: catProyek.id, amount: 3_500_000 },
    { key: 'demo:tx:income:2026-02-25:gaji:0', date: '2026-02-25', catId: catGaji.id, amount: 8_000_000, ruleId: ruleGajiId },
    { key: 'demo:tx:income:2026-03-25:gaji:0', date: '2026-03-25', catId: catGaji.id, amount: 8_000_000, ruleId: ruleGajiId },
    { key: 'demo:tx:income:2026-03-12:proyek:0', date: '2026-03-12', catId: catProyek.id, amount: 4_200_000 },
    { key: 'demo:tx:income:2026-04-28:gaji:0', date: '2026-04-28', catId: catGaji.id, amount: 8_000_000, ruleId: ruleGajiId },
    { key: 'demo:tx:income:2026-04-05:proyek:0', date: '2026-04-05', catId: catProyek.id, amount: 2_000_000 },
    { key: 'demo:tx:income:2026-05-25:gaji:0', date: '2026-05-25', catId: catGaji.id, amount: 8_000_000, ruleId: ruleGajiId },
    { key: 'demo:tx:income:2026-05-15:proyek:0', date: '2026-05-15', catId: catProyek.id, amount: 3_000_000 },
    { key: 'demo:tx:income:2026-06-25:gaji:0', date: '2026-06-25', catId: catGaji.id, amount: 8_000_000, ruleId: ruleGajiId },
    { key: 'demo:tx:income:2026-06-08:proyek:0', date: '2026-06-08', catId: catProyek.id, amount: 5_500_000 },
    { key: 'demo:tx:income:2026-07-25:gaji:0', date: '2026-07-25', catId: catGaji.id, amount: 8_000_000, ruleId: ruleGajiId },
    { key: 'demo:tx:income:2026-07-20:proyek:0', date: '2026-07-20', catId: catProyek.id, amount: 1_500_000 },
    { key: 'demo:tx:income:2026-08-25:gaji:0', date: '2026-08-25', catId: catGaji.id, amount: 8_000_000, ruleId: ruleGajiId },
    { key: 'demo:tx:income:2026-08-10:proyek:0', date: '2026-08-10', catId: catProyek.id, amount: 4_800_000 },
    { key: 'demo:tx:income:2026-08-30:lainnya:0', date: '2026-08-30', catId: catLainnyaIncome.id, amount: 150_000 },
    { key: 'demo:tx:income:2026-09-25:gaji:0', date: '2026-09-25', catId: catGaji.id, amount: 8_000_000, ruleId: ruleGajiId },
    { key: 'demo:tx:income:2026-10-25:gaji:0', date: '2026-10-25', catId: catGaji.id, amount: 8_000_000, ruleId: ruleGajiId },
    { key: 'demo:tx:income:2026-10-07:proyek:0', date: '2026-10-07', catId: catProyek.id, amount: 2_200_000 },
  ]

  const incomeTxRows = incomeData.map((d) => ({
    id: demoId(d.key),
    user_id: userId,
    account_id: accBRI.id,
    category_id: d.catId,
    kind: 'income',
    amount: d.amount,
    note: null,
    occurred_on: d.date,
    recurring_rule_id: d.ruleId ?? null,
  }))

  // Map gaji tx id per bulan (untuk recurring checks)
  const gajiTxByMonth: Record<string, string> = {
    '2025-11': demoId('demo:tx:income:2025-11-25:gaji:0'),
    '2025-12': demoId('demo:tx:income:2025-12-25:gaji:0'),
    '2026-01': demoId('demo:tx:income:2026-01-25:gaji:0'),
    '2026-02': demoId('demo:tx:income:2026-02-25:gaji:0'),
    '2026-03': demoId('demo:tx:income:2026-03-25:gaji:0'),
    '2026-04': demoId('demo:tx:income:2026-04-28:gaji:0'),
    '2026-05': demoId('demo:tx:income:2026-05-25:gaji:0'),
    '2026-06': demoId('demo:tx:income:2026-06-25:gaji:0'),
    '2026-07': demoId('demo:tx:income:2026-07-25:gaji:0'),
    '2026-08': demoId('demo:tx:income:2026-08-25:gaji:0'),
    '2026-09': demoId('demo:tx:income:2026-09-25:gaji:0'),
    '2026-10': demoId('demo:tx:income:2026-10-25:gaji:0'),
  }

  // ─── Siapkan expense transactions (PRNG) ─────────────────────────────────

  type ExpenseCatConfig = {
    catId: string
    minAmt: number
    maxAmt: number
    minCount: number
    maxCount: number
    briWeight: number // 0..1, peluang ke BRI (sisanya Kas)
  }

  const expenseTxRows: Record<string, unknown>[] = []

  MONTHS.forEach(({ year, month }, idx) => {
    const seed = 0xdeadbeef + idx * 1000
    const rng = makePrng(seed)
    const ym = `${year}-${String(month).padStart(2, '0')}`
    const isFeb = idx === 3
    const isBoros = idx === 8

    // Jumlah total transaksi bulan ini
    const totalCount = isFeb
      ? rng.int(20, 25)
      : isBoros
      ? rng.int(40, 45)
      : rng.int(25, 35)

    // Distribusi per kategori
    const catConfigs: ExpenseCatConfig[] = [
      { catId: catMakan.id,       minAmt: 15_000,    maxAmt: 65_000,    minCount: 12, maxCount: 18, briWeight: 0.7 },
      { catId: catTransportasi.id, minAmt: 25_000,   maxAmt: 150_000,   minCount: 4,  maxCount: 8,  briWeight: 1.0 },
      { catId: catTagihan.id,     minAmt: 100_000,   maxAmt: 300_000,   minCount: 2,  maxCount: 3,  briWeight: 1.0 },
      { catId: catKuliah.id,      minAmt: 500_000,   maxAmt: 2_000_000, minCount: 0,  maxCount: 2,  briWeight: 1.0 },
      { catId: catHiburan.id,     minAmt: 50_000,    maxAmt: 200_000,   minCount: 2,  maxCount: 4,  briWeight: 1.0 },
      { catId: catLainnyaExpense.id, minAmt: 30_000, maxAmt: 500_000,   minCount: 2,  maxCount: 5,  briWeight: 1.0 },
    ]

    // Skala jumlah transaksi per kategori secara proporsional agar total mendekati targetCount
    // (Makan mendominasi)
    const baseTotal = catConfigs.reduce((s, c) => s + Math.floor((c.minCount + c.maxCount) / 2), 0)
    const scale = totalCount / baseTotal

    let txIndex = 0
    catConfigs.forEach((cfg) => {
      const rawCount = isFeb
        ? Math.max(0, rng.int(Math.floor(cfg.minCount * 0.6), Math.floor(cfg.maxCount * 0.7)))
        : Math.round(rng.int(cfg.minCount, cfg.maxCount) * scale)
      const count = Math.max(cfg.minCount > 0 ? 1 : 0, rawCount)

      for (let i = 0; i < count; i++) {
        const key = `demo:tx:expense:${ym}:${txIndex}`

        // Tanggal: tersebar di seluruh bulan, termasuk hari 29/30/31
        const lastDay = lastDayOfMonth(year, month)
        const dayOfMonth = rng.int(1, lastDay)
        const dateStr = isoDate(year, month, dayOfMonth)

        // Amount dibulatkan ke kelipatan 1000
        const rawAmt = rng.int(cfg.minAmt / 1000, cfg.maxAmt / 1000) * 1000
        const amount = isFeb ? Math.round(rawAmt * 0.7) : rawAmt

        // Rekening
        const useBRI = rng.bool(cfg.briWeight)
        const accountId = useBRI ? accBRI.id : accKas.id

        // Note
        const noteRoll = rng.next()
        let note: string | null
        if (idx === 5 && i === 0) {
          // Satu per 12 bulan: note tanpa spasi 60 karakter (hanya month index 5)
          note = NOSPACE_NOTE
        } else if (noteRoll < 0.3) {
          note = null
        } else if (noteRoll < 0.7) {
          note = rng.pick(SHORT_NOTES)
        } else if (noteRoll < 0.9) {
          note = rng.pick(MEDIUM_NOTES)
        } else {
          note = rng.pick(SHORT_NOTES)
        }

        expenseTxRows.push({
          id: demoId(key),
          user_id: userId,
          account_id: accountId,
          category_id: cfg.catId,
          kind: 'expense',
          amount,
          note,
          occurred_on: dateStr,
          recurring_rule_id: null,
        })

        txIndex++
      }
    })

    // Jul 2026 extra: laptop
    if (isBoros) {
      expenseTxRows.push({
        id: demoId('demo:tx:expense:2026-07-14:lainnya:boros'),
        user_id: userId,
        account_id: accBRI.id,
        category_id: catLainnyaExpense.id,
        kind: 'expense',
        amount: 7_500_000,
        note: 'Beli laptop baru untuk kerja dan beberapa aksesoris pendukungnya termasuk mouse dan keyboard',
        occurred_on: '2026-07-14',
        recurring_rule_id: null,
      })
    }
  })

  const allTxRows = [...incomeTxRows, ...expenseTxRows]

  // ─── Siapkan trades BTC ───────────────────────────────────────────────────

  const btcTradeRows = [
    {
      id: demoId('demo:trade:btc:oct25:unassigned'),
      user_id: userId, asset_id: assetBTC.id, platform_id: platFloq.id, account_id: null,
      side: 'buy', quantity: 0.0003, price_per_unit: 1_450_000_000, fee: 4350,
      traded_on: '2025-10-01', note: null,
    },
    {
      id: demoId('demo:trade:btc:nov25'),
      user_id: userId, asset_id: assetBTC.id, platform_id: platFloq.id, account_id: accBRI.id,
      side: 'buy', quantity: 0.0005, price_per_unit: 1_480_000_000, fee: 7400,
      traded_on: '2025-11-10', note: null,
    },
    {
      id: demoId('demo:trade:btc:dec25'),
      user_id: userId, asset_id: assetBTC.id, platform_id: platFloq.id, account_id: accBRI.id,
      side: 'buy', quantity: 0.0004, price_per_unit: 1_620_000_000, fee: 6480,
      traded_on: '2025-12-05', note: null,
    },
    {
      id: demoId('demo:trade:btc:jan26'),
      user_id: userId, asset_id: assetBTC.id, platform_id: platFloq.id, account_id: accBRI.id,
      side: 'buy', quantity: 0.0004, price_per_unit: 1_750_000_000, fee: 7000,
      traded_on: '2026-01-15', note: null,
    },
    {
      id: demoId('demo:trade:btc:feb26'),
      user_id: userId, asset_id: assetBTC.id, platform_id: platFloq.id, account_id: accBRI.id,
      side: 'buy', quantity: 0.0003, price_per_unit: 1_890_000_000, fee: 5670,
      traded_on: '2026-02-20', note: null,
    },
    {
      id: demoId('demo:trade:btc:mar26'),
      user_id: userId, asset_id: assetBTC.id, platform_id: platFloq.id, account_id: accBRI.id,
      side: 'buy', quantity: 0.0005, price_per_unit: 1_720_000_000, fee: 8600,
      traded_on: '2026-03-10', note: null,
    },
    {
      id: demoId('demo:trade:btc:apr26:sell'),
      user_id: userId, asset_id: assetBTC.id, platform_id: platFloq.id, account_id: accBRI.id,
      side: 'sell', quantity: 0.0003, price_per_unit: 1_650_000_000, fee: 4950,
      traded_on: '2026-04-18', note: 'Lepas sebagian, rugi tipis',
    },
    {
      id: demoId('demo:trade:btc:may26'),
      user_id: userId, asset_id: assetBTC.id, platform_id: platFloq.id, account_id: accBRI.id,
      side: 'buy', quantity: 0.0004, price_per_unit: 1_810_000_000, fee: 7240,
      traded_on: '2026-05-07', note: null,
    },
    {
      id: demoId('demo:trade:btc:jun26'),
      user_id: userId, asset_id: assetBTC.id, platform_id: platFloq.id, account_id: accBRI.id,
      side: 'buy', quantity: 0.0003, price_per_unit: 2_050_000_000, fee: 6150,
      traded_on: '2026-06-12', note: null,
    },
    {
      id: demoId('demo:trade:btc:jul26'),
      user_id: userId, asset_id: assetBTC.id, platform_id: platFloq.id, account_id: accBRI.id,
      side: 'buy', quantity: 0.0004, price_per_unit: 2_230_000_000, fee: 8920,
      traded_on: '2026-07-08', note: null,
    },
    {
      id: demoId('demo:trade:btc:aug26:sell'),
      user_id: userId, asset_id: assetBTC.id, platform_id: platFloq.id, account_id: accBRI.id,
      side: 'sell', quantity: 0.0005, price_per_unit: 2_100_000_000, fee: 10500,
      traded_on: '2026-08-20', note: 'Realisasi untung sebagian',
    },
    {
      id: demoId('demo:trade:btc:sep26'),
      user_id: userId, asset_id: assetBTC.id, platform_id: platFloq.id, account_id: accBRI.id,
      side: 'buy', quantity: 0.0003, price_per_unit: 2_350_000_000, fee: 7050,
      traded_on: '2026-09-15', note: null,
    },
    {
      id: demoId('demo:trade:btc:oct26a'),
      user_id: userId, asset_id: assetBTC.id, platform_id: platFloq.id, account_id: accBRI.id,
      side: 'buy', quantity: 0.0004, price_per_unit: 2_480_000_000, fee: 9920,
      traded_on: '2026-10-05', note: null,
    },
    {
      id: demoId('demo:trade:btc:oct26b'),
      user_id: userId, asset_id: assetBTC.id, platform_id: platFloq.id, account_id: accBRI.id,
      side: 'buy', quantity: 0.0002, price_per_unit: 2_480_000_000, fee: 4960,
      traded_on: '2026-10-28', note: null,
    },
  ]

  // ─── Siapkan trades EMAS ──────────────────────────────────────────────────

  const emasTradeRows = [
    {
      id: demoId('demo:trade:emas:oct25:unassigned'),
      user_id: userId, asset_id: assetEMAS.id, platform_id: platBRI.id, account_id: null,
      side: 'buy', quantity: 1.0, price_per_unit: 1_190_000, fee: 0,
      traded_on: '2025-10-15', note: null,
    },
    {
      id: demoId('demo:trade:emas:nov25'),
      user_id: userId, asset_id: assetEMAS.id, platform_id: platBRI.id, account_id: accBRI.id,
      side: 'buy', quantity: 2.0, price_per_unit: 1_195_000, fee: 0,
      traded_on: '2025-11-20', note: null,
    },
    {
      id: demoId('demo:trade:emas:jan26'),
      user_id: userId, asset_id: assetEMAS.id, platform_id: platBRI.id, account_id: accBRI.id,
      side: 'buy', quantity: 1.5, price_per_unit: 1_220_000, fee: 0,
      traded_on: '2026-01-25', note: null,
    },
    {
      id: demoId('demo:trade:emas:mar26'),
      user_id: userId, asset_id: assetEMAS.id, platform_id: platBRI.id, account_id: accBRI.id,
      side: 'buy', quantity: 2.0, price_per_unit: 1_245_000, fee: 0,
      traded_on: '2026-03-18', note: null,
    },
    {
      id: demoId('demo:trade:emas:may26:sell'),
      user_id: userId, asset_id: assetEMAS.id, platform_id: platBRI.id, account_id: accBRI.id,
      side: 'sell', quantity: 1.0, price_per_unit: 1_268_000, fee: 0,
      traded_on: '2026-05-22', note: null,
    },
    {
      id: demoId('demo:trade:emas:jul26'),
      user_id: userId, asset_id: assetEMAS.id, platform_id: platBRI.id, account_id: accBRI.id,
      side: 'buy', quantity: 1.5, price_per_unit: 1_290_000, fee: 0,
      traded_on: '2026-07-14', note: null,
    },
    {
      id: demoId('demo:trade:emas:sep26'),
      user_id: userId, asset_id: assetEMAS.id, platform_id: platBRI.id, account_id: accBRI.id,
      side: 'buy', quantity: 1.0, price_per_unit: 1_315_000, fee: 0,
      traded_on: '2026-09-28', note: null,
    },
  ]

  const allTradeRows = [...btcTradeRows, ...emasTradeRows]

  // ─── Siapkan recurring checks ─────────────────────────────────────────────

  // Streaming: skip 2026-01 dan 2026-07
  // DCA BTC: skip 2026-04
  const streamingSkip = new Set(['2026-01', '2026-07'])
  const dcaBtcSkip = new Set(['2026-04'])

  const recurringCheckRows: Record<string, unknown>[] = []

  MONTHS.forEach(({ year, month }) => {
    const ym = `${year}-${String(month).padStart(2, '0')}`
    const monthFirstDay = firstDayOfMonth(year, month)
    const paidAt = `${ym}-15T10:00:00+08:00` // tengah bulan sebagai paid_at

    // Listrik (semua 11 bulan)
    recurringCheckRows.push({
      id: demoId(`demo:check:listrik:${ym}`),
      user_id: userId, rule_id: ruleListrikId,
      month: monthFirstDay, paid_at: paidAt, transaction_id: null,
    })

    // WiFi (semua 11 bulan)
    recurringCheckRows.push({
      id: demoId(`demo:check:wifi:${ym}`),
      user_id: userId, rule_id: ruleWifiId,
      month: monthFirstDay, paid_at: paidAt, transaction_id: null,
    })

    // Streaming (skip 2026-01 dan 2026-07)
    if (!streamingSkip.has(ym)) {
      recurringCheckRows.push({
        id: demoId(`demo:check:streaming:${ym}`),
        user_id: userId, rule_id: ruleStreamingId,
        month: monthFirstDay, paid_at: paidAt, transaction_id: null,
      })
    }

    // Gaji (semua 11 bulan, linked ke tx gaji)
    const gajiTxId = gajiTxByMonth[ym] ?? null
    recurringCheckRows.push({
      id: demoId(`demo:check:gaji:${ym}`),
      user_id: userId, rule_id: ruleGajiId,
      month: monthFirstDay, paid_at: paidAt, transaction_id: gajiTxId,
    })

    // DCA BTC (skip 2026-04)
    if (!dcaBtcSkip.has(ym)) {
      recurringCheckRows.push({
        id: demoId(`demo:check:dca-btc:${ym}`),
        user_id: userId, rule_id: ruleDcaBtcId,
        month: monthFirstDay, paid_at: paidAt, transaction_id: null,
      })
    }
  })

  // ─── Siapkan price snapshots (DATA FIKTIF) ────────────────────────────────

  const priceSnapshotRows: Record<string, unknown>[] = []

  MONTHS.forEach(({ year, month }, idx) => {
    const lastDay = lastDayISO(year, month)

    // BTC snapshot akhir bulan (source: history)
    priceSnapshotRows.push({
      id: demoId(`demo:snapshot:BTC:${lastDay}`),
      user_id: userId, asset_id: assetBTC.id,
      date: lastDay, price: BTC_PRICES[idx], source: 'history',
    })

    // EMAS snapshot akhir bulan (source: manual)
    priceSnapshotRows.push({
      id: demoId(`demo:snapshot:EMAS:${lastDay}`),
      user_id: userId, asset_id: assetEMAS.id,
      date: lastDay, price: EMAS_PRICES[idx], source: 'manual',
    })
  })

  // Snapshot hari ini
  priceSnapshotRows.push({
    id: demoId(`demo:snapshot:BTC:${TODAY}`),
    user_id: userId, asset_id: assetBTC.id,
    date: TODAY, price: BTC_PRICES[12], source: 'manual',
  })
  priceSnapshotRows.push({
    id: demoId(`demo:snapshot:EMAS:${TODAY}`),
    user_id: userId, asset_id: assetEMAS.id,
    date: TODAY, price: EMAS_PRICES[12], source: 'manual',
  })

  // ─── Verifikasi kepemilikan aset tidak pernah negatif ────────────────────

  // BTC
  const btcSorted = [...btcTradeRows].sort((a, b) => a.traded_on.localeCompare(b.traded_on))
  let btcQty = 0
  for (const t of btcSorted) {
    if (t.side === 'buy') btcQty += t.quantity
    else btcQty -= t.quantity
    if (btcQty < -1e-10) {
      console.error(`Verifikasi gagal: kepemilikan BTC negatif setelah trade ${t.traded_on}: ${btcQty}`)
      process.exit(1)
    }
  }

  // EMAS
  const emasSorted = [...emasTradeRows].sort((a, b) => a.traded_on.localeCompare(b.traded_on))
  let emasQty = 0
  for (const t of emasSorted) {
    if (t.side === 'buy') emasQty += t.quantity
    else emasQty -= t.quantity
    if (emasQty < -1e-10) {
      console.error(`Verifikasi gagal: kepemilikan EMAS negatif setelah trade ${t.traded_on}: ${emasQty}`)
      process.exit(1)
    }
  }

  // ─── Hitung perkiraan saldo ───────────────────────────────────────────────

  // Simulasi akun dengan opening balance + semua tx + semua trade
  const simBRI: Account = { ...accBRI, opening_balance: 10_000_000 }
  const simKas: Account = { ...accKas, opening_balance: 2_000_000 }

  // Transaksi dan trade sebagai tipe yang sesuai ledger
  const simTx: Transaction[] = allTxRows.map((r) => ({
    id: r.id as string,
    user_id: r.user_id as string,
    account_id: r.account_id as string | null,
    category_id: r.category_id as string | null,
    kind: r.kind as 'income' | 'expense',
    amount: r.amount as number,
    note: r.note as string | null,
    occurred_on: r.occurred_on as string,
    recurring_rule_id: r.recurring_rule_id as string | null,
  }))

  const simTrades: Trade[] = allTradeRows.map((r) => ({
    id: r.id as string,
    user_id: r.user_id as string,
    asset_id: r.asset_id as string,
    platform_id: r.platform_id as string | null,
    account_id: r.account_id as string | null,
    side: r.side as 'buy' | 'sell',
    quantity: r.quantity as number,
    price_per_unit: r.price_per_unit as number,
    fee: r.fee as number,
    traded_on: r.traded_on as string,
    note: r.note as string | null,
  }))

  const finalBalBRI = accountBalance(simBRI, simTx, simTrades)
  const finalBalKas = accountBalance(simKas, simTx, simTrades)

  // Hitung kepemilikan akhir
  const btcTradeLite = simTrades
    .filter((t) => t.asset_id === assetBTC.id)
    .map((t) => ({ side: t.side, quantity: t.quantity, price: t.price_per_unit, fee: t.fee, date: t.traded_on }))
  const emasTradeLite = simTrades
    .filter((t) => t.asset_id === assetEMAS.id)
    .map((t) => ({ side: t.side, quantity: t.quantity, price: t.price_per_unit, fee: t.fee, date: t.traded_on }))

  const btcPos = computePosition(btcTradeLite, BTC_PRICES[12], new Date(2026, 10, 4))
  const emasPos = computePosition(emasTradeLite, EMAS_PRICES[12], new Date(2026, 10, 4))

  // Hitung grafik titik per aset
  const seriesAssets = [
    { id: assetBTC.id, symbol: 'BTC' },
    { id: assetEMAS.id, symbol: 'EMAS' },
  ]
  const seriesTrades = simTrades.map((t) => ({
    id: t.id, asset_id: t.asset_id, side: t.side, quantity: t.quantity,
    price_per_unit: t.price_per_unit, fee: t.fee, traded_on: t.traded_on,
  }))
  const seriesPrices = priceSnapshotRows.map((p) => ({
    asset_id: p.asset_id as string, date: p.date as string,
    price: p.price as number, source: p.source as string,
  }))
  const currentPrices = { BTC: BTC_PRICES[12], EMAS: EMAS_PRICES[12] }

  const btcSeries = portfolioSeries(seriesTrades, [{ id: assetBTC.id, symbol: 'BTC' }], seriesPrices, currentPrices, assetBTC.id, 'all', TODAY)
  const emasSeries = portfolioSeries(seriesTrades, [{ id: assetEMAS.id, symbol: 'EMAS' }], seriesPrices, currentPrices, assetEMAS.id, 'all', TODAY)
  const allSeries = portfolioSeries(seriesTrades, seriesAssets, seriesPrices, currentPrices, 'all', 'all', TODAY)

  // ─── Format Rupiah lokal ──────────────────────────────────────────────────

  function fmtRp(n: number): string {
    return 'Rp ' + Math.round(n).toLocaleString('id-ID')
  }

  // ─── Dry-run output ───────────────────────────────────────────────────────

  if (DRY_RUN) {
    console.log('\n=== RENCANA SEED DEMO (--dry-run) ===')
    console.log(`Akun: ${maskEmail(email)}`)
    console.log('Rentang: 2025-11-01 sampai 2026-11-04 (12 bulan)')
    console.log('CATATAN: Semua data adalah DATA FIKTIF, bukan data pasar sungguhan.')
    console.log('')
    console.log('Tabel yang akan diisi:')
    console.log(`  transactions   : ${allTxRows.length} baris`)
    console.log(`  recurring_rules: ${recurringRules.length} baris`)
    console.log(`  recurring_checks: ${recurringCheckRows.length} baris`)
    console.log(`  trades         : ${allTradeRows.length} baris`)
    console.log(`  price_snapshots: ${priceSnapshotRows.length} baris`)
    console.log('')
    console.log('Perkiraan saldo akhir (setelah opening balance diperbarui):')
    console.log(`  BRI : ${fmtRp(finalBalBRI)}`)
    console.log(`  Kas : ${fmtRp(finalBalKas)}`)
    console.log('')
    console.log('Kepemilikan aset hari ini (DATA FIKTIF):')
    console.log(`  BTC : ${btcPos.qty.toFixed(4)} BTC  |  Nilai: ${fmtRp(btcPos.value)}  |  ROI: ${btcPos.roi !== null ? (btcPos.roi * 100).toFixed(2) + '%' : '-'}`)
    console.log(`  EMAS: ${emasPos.qty.toFixed(1)} gram  |  Nilai: ${fmtRp(emasPos.value)}  |  ROI: ${emasPos.roi !== null ? (emasPos.roi * 100).toFixed(2) + '%' : '-'}`)
    console.log('')
    console.log(`Titik grafik BTC : ${btcSeries.length} bulan`)
    console.log(`Titik grafik EMAS: ${emasSeries.length} bulan`)
    console.log(`Titik grafik semua: ${allSeries.length} bulan`)
    console.log('')
    console.log('Jalankan dengan --yes untuk menulis.')
    return
  }

  // ─── Konfirmasi sebelum menulis ───────────────────────────────────────────

  if (YES) {
    console.log(`\nMenulis data demo ke akun: ${maskEmail(email)}`)
    console.log('CATATAN: Semua data adalah DATA FIKTIF, bukan data pasar sungguhan.')

    // 1. Update opening balance akun
    console.log('Memperbarui saldo awal rekening...')
    const { error: errBRI } = await supabase
      .from('accounts')
      .update({ opening_balance: 10_000_000 })
      .eq('id', accBRI.id)
    if (errBRI) {
      console.error(`Gagal memperbarui opening balance BRI: ${errBRI.message}`)
      process.exit(1)
    }

    const { error: errKas } = await supabase
      .from('accounts')
      .update({ opening_balance: 2_000_000 })
      .eq('id', accKas.id)
    if (errKas) {
      console.error(`Gagal memperbarui opening balance Kas: ${errKas.message}`)
      process.exit(1)
    }

    // 2. Recurring rules
    console.log('Menulis recurring rules...')
    await upsertBatched(supabase, 'recurring_rules', recurringRules)

    // 3. Income transactions (dulu, karena recurring_checks referensi mereka)
    console.log('Menulis transaksi pemasukan...')
    await upsertBatched(supabase, 'transactions', incomeTxRows)

    // 4. Recurring checks
    console.log('Menulis recurring checks...')
    await upsertBatched(supabase, 'recurring_checks', recurringCheckRows)

    // 5. Expense transactions
    console.log('Menulis transaksi pengeluaran...')
    await upsertBatched(supabase, 'transactions', expenseTxRows)

    // 6. Trades
    console.log('Menulis trades...')
    await upsertBatched(supabase, 'trades', allTradeRows)

    // 7. Price snapshots
    console.log('Menulis price snapshots (DATA FIKTIF)...')
    await upsertBatched(supabase, 'price_snapshots', priceSnapshotRows)

    // 8. Update manual_price dan manual_price_at di asset EMAS
    console.log('Memperbarui harga manual EMAS (DATA FIKTIF)...')
    const { error: errEmas } = await supabase
      .from('assets')
      .update({ manual_price: 1_330_000, manual_price_at: `${TODAY}T00:00:00+08:00` })
      .eq('id', assetEMAS.id)
    if (errEmas) {
      console.error(`Gagal memperbarui manual_price EMAS: ${errEmas.message}`)
      process.exit(1)
    }

    console.log('\nSelesai menulis. Memverifikasi data...')

    // ─── Verifikasi setelah tulis ─────────────────────────────────────────

    const [
      { data: vTx, error: vTxErr },
      { data: vRules, error: vRulesErr },
      { data: vChecks, error: vChecksErr },
      { data: vTrades, error: vTradesErr },
      { data: vSnaps, error: vSnapsErr },
      { data: vAccounts, error: vAccErr },
    ] = await Promise.all([
      supabase.from('transactions').select('*'),
      supabase.from('recurring_rules').select('*'),
      supabase.from('recurring_checks').select('*'),
      supabase.from('trades').select('*'),
      supabase.from('price_snapshots').select('*'),
      supabase.from('accounts').select('*'),
    ])

    if (vTxErr || vRulesErr || vChecksErr || vTradesErr || vSnapsErr || vAccErr) {
      console.error('Gagal membaca data untuk verifikasi.')
      process.exit(1)
    }

    let verifyFailed = false

    console.log('\n=== HASIL VERIFIKASI ===')
    console.log(`transactions   : ${vTx?.length ?? 0} baris (diharapkan >= ${allTxRows.length})`)
    console.log(`recurring_rules: ${vRules?.length ?? 0} baris (diharapkan >= ${recurringRules.length})`)
    console.log(`recurring_checks: ${vChecks?.length ?? 0} baris (diharapkan >= ${recurringCheckRows.length})`)
    console.log(`trades         : ${vTrades?.length ?? 0} baris (diharapkan >= ${allTradeRows.length})`)
    console.log(`price_snapshots: ${vSnaps?.length ?? 0} baris (diharapkan >= ${priceSnapshotRows.length})`)

    // Hitung saldo akhir dari data yang baru ditulis
    const vAccBRI = (vAccounts ?? []).find((a: Record<string, unknown>) => a.name === 'BRI') as Account | undefined
    const vAccKas = (vAccounts ?? []).find((a: Record<string, unknown>) => a.name === 'Kas') as Account | undefined

    if (vAccBRI && vAccKas) {
      const vTxTyped: Transaction[] = (vTx ?? []) as Transaction[]
      const vTradesTyped: Trade[] = (vTrades ?? []) as Trade[]

      const vBalBRI = accountBalance(vAccBRI, vTxTyped, vTradesTyped)
      const vBalKas = accountBalance(vAccKas, vTxTyped, vTradesTyped)

      console.log('\nSaldo akhir rekening:')
      console.log(`  BRI : ${fmtRp(vBalBRI)}`)
      console.log(`  Kas : ${fmtRp(vBalKas)}`)

      if (vBalBRI < 0) {
        console.error('PELANGGARAN: Saldo BRI negatif!')
        verifyFailed = true
      }
      if (vBalKas < 0) {
        console.error('PELANGGARAN: Saldo Kas negatif!')
        verifyFailed = true
      }

      // Verifikasi saldo per bulan tidak negatif
      for (const { year, month } of MONTHS) {
        const ym = `${year}-${String(month).padStart(2, '0')}`
        const lastDay = lastDayISO(year, month)
        const balBRI = accountBalance(vAccBRI, vTxTyped, vTradesTyped, lastDay)
        if (balBRI < 0) {
          console.error(`PELANGGARAN: Saldo BRI negatif di akhir ${ym}: ${fmtRp(balBRI)}`)
          verifyFailed = true
        }
      }

      // Kepemilikan aset dari data yang ditulis
      const vBtcTrades = vTradesTyped.filter((t) => t.asset_id === assetBTC.id)
      const vEmasTrades = vTradesTyped.filter((t) => t.asset_id === assetEMAS.id)

      // Verifikasi kepemilikan tidak pernah negatif di tiap bulan
      for (const { year, month } of MONTHS) {
        const lastDay = lastDayISO(year, month)
        const ym = `${year}-${String(month).padStart(2, '0')}`

        const btcLite = vBtcTrades
          .filter((t) => t.traded_on <= lastDay)
          .map((t) => ({ side: t.side, quantity: t.quantity, price: t.price_per_unit, fee: t.fee, date: t.traded_on }))
        const emasLite = vEmasTrades
          .filter((t) => t.traded_on <= lastDay)
          .map((t) => ({ side: t.side, quantity: t.quantity, price: t.price_per_unit, fee: t.fee, date: t.traded_on }))

        const btcPosMonth = computePosition(btcLite, null)
        const emasPosMon = computePosition(emasLite, null)

        if (btcPosMonth.qty < -1e-10) {
          console.error(`PELANGGARAN: Kepemilikan BTC negatif di ${ym}: ${btcPosMonth.qty}`)
          verifyFailed = true
        }
        if (emasPosMon.qty < -1e-10) {
          console.error(`PELANGGARAN: Kepemilikan EMAS negatif di ${ym}: ${emasPosMon.qty}`)
          verifyFailed = true
        }
      }

      // Posisi akhir dan metrik investasi
      const vBtcTradeLite = vBtcTrades.map((t) => ({
        side: t.side, quantity: t.quantity, price: t.price_per_unit, fee: t.fee, date: t.traded_on,
      }))
      const vEmasTradeLite = vEmasTrades.map((t) => ({
        side: t.side, quantity: t.quantity, price: t.price_per_unit, fee: t.fee, date: t.traded_on,
      }))

      const vBtcPos = computePosition(vBtcTradeLite, BTC_PRICES[12], new Date(2026, 10, 4))
      const vEmasPos = computePosition(vEmasTradeLite, EMAS_PRICES[12], new Date(2026, 10, 4))

      console.log('\nKepemilikan aset hari ini (DATA FIKTIF):')
      console.log(`  BTC : ${vBtcPos.qty.toFixed(4)} BTC  |  Nilai: ${fmtRp(vBtcPos.value)}  |  ROI: ${vBtcPos.roi !== null ? (vBtcPos.roi * 100).toFixed(2) + '%' : '-'}`)
      console.log(`  EMAS: ${vEmasPos.qty.toFixed(1)} gram  |  Nilai: ${fmtRp(vEmasPos.value)}  |  ROI: ${vEmasPos.roi !== null ? (vEmasPos.roi * 100).toFixed(2) + '%' : '-'}`)

      // Titik grafik dari data yang sudah ditulis
      const vSeriesTrades = vTradesTyped.map((t) => ({
        id: t.id, asset_id: t.asset_id, side: t.side, quantity: t.quantity,
        price_per_unit: t.price_per_unit, fee: t.fee, traded_on: t.traded_on,
      }))
      const vSeriesPrices = (vSnaps ?? []).map((p: Record<string, unknown>) => ({
        asset_id: p.asset_id as string, date: p.date as string,
        price: Number(p.price), source: p.source as string,
      }))

      const vBtcSeries = portfolioSeries(vSeriesTrades, [{ id: assetBTC.id, symbol: 'BTC' }], vSeriesPrices, currentPrices, assetBTC.id, 'all', TODAY)
      const vEmasSeries = portfolioSeries(vSeriesTrades, [{ id: assetEMAS.id, symbol: 'EMAS' }], vSeriesPrices, currentPrices, assetEMAS.id, 'all', TODAY)
      const vAllSeries = portfolioSeries(vSeriesTrades, seriesAssets, vSeriesPrices, currentPrices, 'all', 'all', TODAY)

      console.log(`\nTitik grafik BTC : ${vBtcSeries.length} bulan`)
      console.log(`Titik grafik EMAS: ${vEmasSeries.length} bulan`)
      console.log(`Titik grafik semua: ${vAllSeries.length} bulan`)

      // Total pemasukan dan pengeluaran per bulan
      console.log('\nRingkasan per bulan:')
      MONTHS.forEach(({ year, month }) => {
        const ym = `${year}-${String(month).padStart(2, '0')}`
        const monthTx = vTxTyped.filter((t) => t.occurred_on.startsWith(ym))
        const income = monthTx.filter((t) => t.kind === 'income').reduce((s, t) => s + t.amount, 0)
        const expense = monthTx.filter((t) => t.kind === 'expense').reduce((s, t) => s + t.amount, 0)
        console.log(`  ${ym}  masuk: ${fmtRp(income).padStart(16)}  keluar: ${fmtRp(expense).padStart(16)}  net: ${fmtRp(income - expense).padStart(16)}`)
      })
    } else {
      console.error('Gagal menemukan rekening BRI/Kas untuk verifikasi saldo.')
      verifyFailed = true
    }

    if (verifyFailed) {
      console.error('\nVerifikasi gagal. Ada pelanggaran yang terdeteksi.')
      process.exit(1)
    }

    console.log('\nSemua verifikasi lolos. Data demo berhasil ditulis.')
    console.log('CATATAN: Semua angka adalah DATA FIKTIF, bukan data keuangan atau pasar sungguhan.')
  }
}

main().catch((err) => {
  console.error('Error tidak terduga:', err instanceof Error ? err.message : String(err))
  process.exit(1)
})
