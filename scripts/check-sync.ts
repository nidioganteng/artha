// Uji logika sinkronisasi lokal-dulu. Jalankan: npm run check:sync
import * as sync from '../src/lib/sync'
import type { DB } from '../src/lib/types'

type Row = sync.Row
type Op = sync.Op
type FailedOp = sync.FailedOp
type ApplyOpFn = (base: DB, op: Op) => DB

const applyOp = (sync as Record<string, unknown>).applyOp as ApplyOpFn | undefined
const { isAuthError, blockedByIds, findBlocker } = sync

const { applyOps, emptyDB } = sync

let failed = 0
function ok(name: string, cond: boolean, detail = '') {
  console.log(`${cond ? 'OK  ' : 'GAGAL'} ${name}${detail ? ' | ' + detail : ''}`)
  if (!cond) failed++
}

const u = () => Math.random().toString(36).slice(2, 10)
const row = (id: string, extra?: Record<string, unknown>): Row => ({ id, user_id: 'u1', ...extra })
const ups = (table: keyof DB, r: Row): Op => ({ opId: u(), table, op: 'upsert', row: r })
const del = (table: keyof DB, id: string): Op => ({ opId: u(), table, op: 'delete', id })

// ── applyOps: dasar (selalu harus lolos) ──────────────────────────────────────

ok('applyOps: upsert menambah baris baru', applyOps(emptyDB(), [ups('platforms', row('p1', { name: 'Floq' }))]).platforms.length === 1)
ok('applyOps: upsert ke id yang sama = update, bukan duplikasi', (() => {
  const db = applyOps(emptyDB(), [ups('platforms', row('p1', { name: 'Floq' })), ups('platforms', row('p1', { name: 'Floq 2' }))])
  return db.platforms.length === 1 && (db.platforms[0] as { name: string }).name === 'Floq 2'
})())
ok('applyOps: delete menghapus baris', applyOps(emptyDB(), [ups('platforms', row('p1', { name: 'Floq' })), del('platforms', 'p1')]).platforms.length === 0)
ok('applyOps: delete id tidak ada tidak error', applyOps(emptyDB(), [del('platforms', 'xx'), ups('platforms', row('p1', { name: 'Floq' }))]).platforms.length === 1)
ok('applyOps: urutan berpengaruh (upsert lalu delete = kosong)', (() => {
  const db = applyOps(emptyDB(), [ups('accounts', row('a1', { name: 'Kas' })), del('accounts', 'a1')])
  return db.accounts.length === 0
})())

// ── applyOp tunggal (GAGAL sebelum applyOp ditambahkan ke sync.ts) ────────────

ok('applyOp diekspor dari sync.ts', typeof applyOp === 'function')

if (typeof applyOp !== 'function') {
  // Lewati semua tes yang bergantung pada applyOp
  const skip = (name: string) => ok(`${name} [dilewati: applyOp belum ada]`, false)
  skip('applyOp: upsert menambah baris')
  skip('applyOp: update baris yang sudah ada')
  skip('applyOp: delete menghapus baris')
  // Bug flush #1
  skip('flush: baris upsert tetap tampil di UI setelah op berhasil di-commit ke serverRef')
  skip('flush: baris delete hilang dari UI setelah op berhasil di-commit ke serverRef')
  // Race condition refresh
  skip('race: version berubah selama fetch → snapshot basi dibuang, baris baru tetap ada')
} else {
  // ── applyOp tunggal ────────────────────────────────────────────────────────
  {
    const db = applyOp(emptyDB(), ups('accounts', row('a1', { name: 'Kas' })))
    ok('applyOp: upsert menambah baris', db.accounts.length === 1)
  }
  {
    const base = applyOp(emptyDB(), ups('accounts', row('a1', { name: 'Kas' })))
    const db = applyOp(base, ups('accounts', row('a1', { name: 'Kas Tunai' })))
    ok('applyOp: update baris yang sudah ada', db.accounts.length === 1 && (db.accounts[0] as { name: string }).name === 'Kas Tunai')
  }
  {
    const base = applyOp(emptyDB(), ups('accounts', row('a1', { name: 'Kas' })))
    const db = applyOp(base, del('accounts', 'a1'))
    ok('applyOp: delete menghapus baris', db.accounts.length === 0)
  }

  // ── Bug flush #1: flush sukses harus memperbarui serverRef ────────────────
  // Skenario: user save → masuk queue; flush berhasil → op di-shift dari queue.
  // Jika serverRef TIDAK diperbarui → rebuild() = applyOps(serverRef, []) → baris hilang.
  // Setelah perbaikan: applyOp(serverRef, op) dipanggil sebelum shift.
  {
    const serverSnap = emptyDB()
    const op = ups('accounts', row('a1', { name: 'Kas', type: 'cash', opening_balance: 0 }))

    // Sebelum flush: UI menampilkan baris secara optimistis
    ok('sebelum flush: baris tampil dari antrean', applyOps(serverSnap, [op]).accounts.length === 1)

    // Commit op ke serverRef (yang benar: applyOp) lalu kosongkan antrean
    const serverAfterFlush = applyOp(serverSnap, op)
    const uiSetelahFlush = applyOps(serverAfterFlush, [])
    ok('flush: baris upsert tetap tampil di UI setelah op berhasil di-commit ke serverRef', uiSetelahFlush.accounts.length === 1)

    // Bukti bug lama: jika serverRef tidak diperbarui, baris hilang
    ok('bukti bug lama: tanpa update serverRef baris hilang', applyOps(serverSnap, []).accounts.length === 0)
  }
  {
    const upsertOp = ups('platforms', row('p1', { name: 'Floq' }))
    const serverWithRow = applyOp(emptyDB(), upsertOp)
    const deleteOp = del('platforms', 'p1')

    // Commit delete ke serverRef lalu kosongkan antrean
    const serverAfterDelete = applyOp(serverWithRow, deleteOp)
    ok('flush: baris delete hilang dari UI setelah op berhasil di-commit ke serverRef', applyOps(serverAfterDelete, []).platforms.length === 0)

    // Bukti bug lama: baris terhapus muncul kembali
    ok('bukti bug lama: tanpa update serverRef baris terhapus muncul kembali', applyOps(serverWithRow, []).platforms.length === 1)
  }

  // ── Race condition refresh: version counter ───────────────────────────────
  // Skenario: refresh() mulai fetch 8 tabel; di tengah fetch, save() + flush() berjalan
  // dan memperbarui serverRef (dengan perbaikan bug flush). Lalu fetch selesai dengan
  // snapshot basi. Tanpa version check, snapshot basi menimpa serverRef → baris baru hilang.
  {
    const r1 = row('p1', { name: 'Floq' })
    let serverRef = applyOp(emptyDB(), ups('platforms', r1))
    let version = 0

    // refresh() mencatat versi setelah flush awal
    const snapBeforeFetch = version

    // Selama fetch berjalan: save() + flush() sukses untuk baris baru
    const r2 = row('p2', { name: 'BRI' })
    const op2 = ups('platforms', r2)
    serverRef = applyOp(serverRef, op2) // flush sukses → serverRef diperbarui
    version++                            // versi naik

    // fetch selesai dengan hasil basi (hanya punya r1, bukan r2)
    const staleFetch = applyOp(emptyDB(), ups('platforms', r1))

    // Tanpa version check: timpa serverRef dengan hasil basi → r2 hilang
    ok('race: tanpa version check, baris baru hilang setelah fetch basi', applyOps(staleFetch, []).platforms.length === 1)

    // Dengan version check: versi berubah → buang fetch, pertahankan serverRef
    const versionChanged = version !== snapBeforeFetch
    const effectiveSnap = versionChanged ? serverRef : staleFetch
    ok('race: dengan version check, baris baru dipertahankan', applyOps(effectiveSnap, []).platforms.length === 2)
  }
}

// ── isAuthError ──────────────────────────────────────────────────────────────
ok('isAuthError: JWT expired', isAuthError('JWT expired'))
ok('isAuthError: not authenticated', isAuthError('User is not authenticated'))
ok('isAuthError: invalid_grant', isAuthError('AuthApiError: invalid_grant'))
ok('isAuthError: bukan auth — constraint', !isAuthError('duplicate key value violates unique constraint'))
ok('isAuthError: bukan auth — jaringan', !isAuthError('Failed to fetch'))
ok('isAuthError: bukan auth — RLS', !isAuthError('row-level security policy'))

// ── blockedByIds ──────────────────────────────────────────────────────────────
{
  const tradeOp: Op = ups('trades', row('t1', { asset_id: 'a1', platform_id: 'p1', side: 'buy', quantity: 1, price_per_unit: 1, fee: 0, traded_on: '2026-01-01' }))
  ok('blockedByIds: trade diblokir oleh aset gagal', blockedByIds(tradeOp, new Set(['a1'])))
  ok('blockedByIds: trade diblokir oleh platform gagal', blockedByIds(tradeOp, new Set(['p1'])))
  ok('blockedByIds: trade tidak diblokir jika aset lain yang gagal', !blockedByIds(tradeOp, new Set(['a2'])))
  ok('blockedByIds: delete tidak pernah diblokir', !blockedByIds(del('trades', 't1'), new Set(['a1'])))
  ok('blockedByIds: platform (tanpa FK) tidak diblokir', !blockedByIds(ups('platforms', row('p1')), new Set(['p1'])))
  ok('blockedByIds: set kosong = tidak diblokir', !blockedByIds(tradeOp, new Set()))
}
{
  const txOp: Op = ups('transactions', row('tx1', { account_id: 'acc1', category_id: 'cat1', kind: 'expense', amount: 1000, occurred_on: '2026-01-01' }))
  ok('blockedByIds: transaksi diblokir oleh rekening gagal', blockedByIds(txOp, new Set(['acc1'])))
  ok('blockedByIds: transaksi diblokir oleh kategori gagal', blockedByIds(txOp, new Set(['cat1'])))
}

// ── findBlocker ───────────────────────────────────────────────────────────────
{
  const assetOp: Op = ups('assets', row('a1', { symbol: 'BTC', name: 'Bitcoin', asset_type: 'crypto', unit: 'BTC', price_source: 'indodax', price_ref: 'btcidr' }))
  const tradeOp: Op = ups('trades', row('t1', { asset_id: 'a1', platform_id: null, side: 'buy', quantity: 0.001, price_per_unit: 1e9, fee: 0, traded_on: '2026-01-01' }))
  const failedAsset: FailedOp = { ...assetOp, error: 'constraint violation', blocked: false }

  ok('findBlocker: trade diblokir oleh aset gagal', findBlocker(tradeOp, [failedAsset]) === failedAsset.opId)
  ok('findBlocker: delete op tidak terblokir', findBlocker(del('trades', 't1'), [failedAsset]) === undefined)
  ok('findBlocker: tidak ada failed op → undefined', findBlocker(tradeOp, []) === undefined)

  // Blocked op sendiri tidak bisa memblokir op lain (blocked: true diabaikan)
  const blockedTrade: FailedOp = { ...tradeOp, error: 'Bergantung pada op yang gagal', blocked: true, blockedBy: failedAsset.opId }
  const anotherTrade: Op = ups('trades', row('t2', { asset_id: 'a1', side: 'buy', quantity: 0.002, price_per_unit: 1e9, fee: 0, traded_on: '2026-02-01', platform_id: null }))
  ok('findBlocker: op blocked tidak ikut memblokir op lain', findBlocker(anotherTrade, [blockedTrade]) === undefined)
  ok('findBlocker: op non-blocked tetap memblokir', findBlocker(anotherTrade, [failedAsset, blockedTrade]) === failedAsset.opId)
}

// ── Edit offline (upsert id sama) ─────────────────────────────────────────────
ok('edit offline: upsert id sama = update tanpa duplikat', (() => {
  const db1 = applyOps(emptyDB(), [ups('transactions', row('tx1', { amount: 100 }))])
  const db2 = applyOps(db1, [ups('transactions', row('tx1', { amount: 200 }))])
  return db2.transactions.length === 1 && (db2.transactions[0] as { amount: number }).amount === 200
})())

ok('hapus offline: delete masuk antrean lalu baris hilang', (() => {
  const db1 = applyOps(emptyDB(), [ups('transactions', row('tx1', { amount: 100 }))])
  const db2 = applyOps(db1, [del('transactions', 'tx1')])
  return db2.transactions.length === 0
})())

ok('hapus offline: delete id tidak ada tidak error', (() => {
  const db = applyOps(emptyDB(), [del('transactions', 'nonexistent')])
  return db.transactions.length === 0
})())

// ── skenario lengkap: aset gagal → trade diblokir ────────────────────────────
{
  // Simulasikan: upsert aset gagal, lalu queue masih punya trade untuk aset itu
  const assetOp: Op = ups('assets', row('a1', { symbol: 'BTC', name: 'Bitcoin', asset_type: 'crypto', unit: 'BTC', price_source: 'indodax', price_ref: 'btcidr' }))
  const tradeOp: Op = ups('trades', row('t1', { asset_id: 'a1', platform_id: null, side: 'buy', quantity: 0.001, price_per_unit: 1e9, fee: 0, traded_on: '2026-01-01' }))

  const failedOps: FailedOp[] = [{ ...assetOp, error: 'duplicate key', blocked: false }]
  const queue: Op[] = [tradeOp]

  ok('skenario: trade diblokir karena aset-nya gagal', findBlocker(queue[0], failedOps) !== undefined)
  ok('skenario: trade bisa dikirim jika tidak ada aset gagal', findBlocker(queue[0], []) === undefined)

  // Setelah aset di-retry (dihapus dari failedOps), trade tidak lagi terblokir
  const failedAfterRetry: FailedOp[] = []
  ok('skenario: trade tidak terblokir setelah retry aset', findBlocker(queue[0], failedAfterRetry) === undefined)
}

// ── Trade dengan account_id (fitur ledger) ────────────────────────────────────
{
  const tradeOp: Op = ups('trades', row('t1', {
    asset_id: 'a1',
    platform_id: 'p1',
    account_id: 'acc1',
    side: 'buy',
    quantity: 0.001,
    price_per_unit: 1e9,
    fee: 0,
    traded_on: '2026-01-01',
  }))

  ok('trade dengan account_id: diblokir oleh rekening gagal', blockedByIds(tradeOp, new Set(['acc1'])))
  ok('trade dengan account_id: tidak diblokir rekening lain', !blockedByIds(tradeOp, new Set(['acc2'])))
  ok('trade dengan account_id: aset tetap bisa memblokir', blockedByIds(tradeOp, new Set(['a1'])))
  ok('trade dengan account_id: platform tetap bisa memblokir', blockedByIds(tradeOp, new Set(['p1'])))

  const failedAcc: FailedOp = {
    ...ups('accounts', row('acc1', { name: 'BRI', type: 'bank', opening_balance: 0 })),
    error: 'constraint violation',
    blocked: false,
  }
  ok('findBlocker trade: diblokir rekening gagal', findBlocker(tradeOp, [failedAcc]) === failedAcc.opId)

  // Trade tanpa account_id (undefined) tidak boleh diblokir oleh rekening apa pun
  const tradeNoAcc: Op = ups('trades', row('t2', {
    asset_id: 'a1',
    platform_id: 'p1',
    side: 'buy',
    quantity: 0.001,
    price_per_unit: 1e9,
    fee: 0,
    traded_on: '2026-01-01',
  }))
  ok('trade tanpa account_id: tidak diblokir rekening gagal', !blockedByIds(tradeNoAcc, new Set(['acc1'])))

  // Trade dengan account_id = null (JSON) — null bukan string → tidak diblokir
  const tradeNullAcc: Op = ups('trades', row('t3', {
    asset_id: 'a1',
    platform_id: 'p1',
    account_id: null,
    side: 'buy',
    quantity: 0.001,
    price_per_unit: 1e9,
    fee: 0,
    traded_on: '2026-01-01',
  }))
  ok('trade account_id null: tidak diblokir rekening gagal', !blockedByIds(tradeNullAcc, new Set(['acc1'])))
}

// ── Edit trade (upsert id sama) dengan account_id ────────────────────────────
ok('edit trade: upsert id sama = update, account_id berubah', (() => {
  const db1 = applyOps(emptyDB(), [ups('trades', row('t1', {
    asset_id: 'a1', platform_id: 'p1', account_id: null,
    side: 'buy', quantity: 0.001, price_per_unit: 1e9, fee: 0, traded_on: '2026-01-01',
  }))])
  const db2 = applyOps(db1, [ups('trades', row('t1', {
    asset_id: 'a1', platform_id: 'p1', account_id: 'acc1',
    side: 'buy', quantity: 0.001, price_per_unit: 1e9, fee: 0, traded_on: '2026-01-01',
  }))])
  return db2.trades.length === 1 && (db2.trades[0] as { account_id: string | null }).account_id === 'acc1'
})())

// ── Baca trade tanpa account_id (snapshot dari server lama) ──────────────────
ok('trade dari server lama (tanpa account_id) tetap muncul di UI', (() => {
  const db = applyOps(emptyDB(), [ups('trades', row('t1', {
    asset_id: 'a1', platform_id: 'p1',
    side: 'buy', quantity: 0.001, price_per_unit: 1e9, fee: 0, traded_on: '2026-01-01',
  }))])
  return db.trades.length === 1
})())

// ── price_snapshots (tabel baru untuk grafik perkembangan investasi) ─────────
{
  // Upsert snapshot menambah baris
  const op1: Op = ups('price_snapshots', row('ps1', {
    asset_id: 'a1', date: '2026-10-01', price: 1_000_000_000, source: 'live',
  }))
  const db1 = applyOps(emptyDB(), [op1])
  ok('price_snapshots: upsert menambah baris', db1.price_snapshots.length === 1)

  // Upsert id sama = update, bukan duplikat (idempotent lewat getOrCreateSnapshotId)
  const op2: Op = ups('price_snapshots', row('ps1', {
    asset_id: 'a1', date: '2026-10-01', price: 1_050_000_000, source: 'live',
  }))
  const db2 = applyOps(db1, [op2])
  ok('price_snapshots: upsert id sama = update (idempotent)',
    db2.price_snapshots.length === 1 &&
    (db2.price_snapshots[0] as { price: number }).price === 1_050_000_000)

  // Delete snapshot
  const db3 = applyOps(db2, [del('price_snapshots', 'ps1')])
  ok('price_snapshots: delete menghapus baris', db3.price_snapshots.length === 0)

  // Snapshot diblokir oleh asset gagal (price_snapshots.asset_id → assets.id)
  // Catatan: price_snapshots BELUM terdaftar di FK_FIELDS, jadi tidak diblokir.
  // Ini sengaja: data snapshot bersifat metadata, bisa dibuang kalau asetnya hilang.
  ok('price_snapshots: tidak diblokir oleh asset gagal (metadata-only)',
    !blockedByIds(op1, new Set(['a1'])))
}

// ── profiles (tabel baru, OPTIONAL) ───────────────────────────────────────────
{
  const profileOp: Op = ups('profiles', row('u1', { mode: 'lengkap', mode_locked: false }))
  const db1 = applyOps(emptyDB(), [profileOp])
  ok('profiles: upsert menambah baris', db1.profiles.length === 1)

  const profileUpdate: Op = ups('profiles', row('u1', { mode: 'investasi', mode_locked: false }))
  const db2 = applyOps(db1, [profileUpdate])
  ok('profiles: upsert id sama = update', db2.profiles.length === 1 && (db2.profiles[0] as { mode: string }).mode === 'investasi')

  const db3 = applyOps(db2, [del('profiles', 'u1')])
  ok('profiles: delete menghapus baris', db3.profiles.length === 0)
}

// ── contributors (tabel baru, OPTIONAL) ───────────────────────────────────────
{
  const contribOp: Op = ups('contributors', row('c1', { name: 'Dio', sort_order: 0 }))
  const db1 = applyOps(emptyDB(), [contribOp])
  ok('contributors: upsert menambah baris', db1.contributors.length === 1)

  const contribUpdate: Op = ups('contributors', row('c1', { name: 'Dio Updated', sort_order: 0 }))
  const db2 = applyOps(db1, [contribUpdate])
  ok('contributors: upsert id sama = update (idempotent)', db2.contributors.length === 1 && (db2.contributors[0] as { name: string }).name === 'Dio Updated')

  const db3 = applyOps(db2, [del('contributors', 'c1')])
  ok('contributors: delete menghapus baris', db3.contributors.length === 0)
}

// ── contributor_id FK pada trade ──────────────────────────────────────────────
{
  const tradeWithContrib: Op = ups('trades', row('t1', {
    asset_id: 'a1',
    platform_id: 'p1',
    account_id: null,
    contributor_id: 'c1',
    side: 'buy',
    quantity: 0.001,
    price_per_unit: 1e9,
    fee: 0,
    traded_on: '2026-01-01',
  }))

  ok('trade contributor_id: diblokir oleh kontributor gagal', blockedByIds(tradeWithContrib, new Set(['c1'])))
  ok('trade contributor_id: tidak diblokir kontributor lain', !blockedByIds(tradeWithContrib, new Set(['c99'])))

  const failedContrib: FailedOp = {
    ...ups('contributors', row('c1', { name: 'Dio', sort_order: 0 })),
    error: 'constraint violation',
    blocked: false,
  }
  ok('findBlocker trade: diblokir kontributor gagal', findBlocker(tradeWithContrib, [failedContrib]) === failedContrib.opId)

  // contributor_id = null tidak memblokir
  const tradeNullContrib: Op = ups('trades', row('t2', {
    asset_id: 'a1', platform_id: 'p1', account_id: null, contributor_id: null,
    side: 'buy', quantity: 0.001, price_per_unit: 1e9, fee: 0, traded_on: '2026-01-01',
  }))
  ok('trade contributor_id null: tidak diblokir kontributor gagal', !blockedByIds(tradeNullContrib, new Set(['c1'])))
}

console.log(failed === 0 ? '\nSemua uji lolos.' : `\n${failed} uji gagal.`)
process.exit(failed === 0 ? 0 : 1)
