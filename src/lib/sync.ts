// Logika murni sinkronisasi lokal-dulu: tipe, normalisasi, dan penerapan antrean op ke snapshot DB.
// Semua fungsi tanpa efek samping sehingga mudah diuji (lihat scripts/check-sync.ts).
import type { DB, TableName } from './types'

export type Row = { id: string } & Record<string, unknown>
export type Op =
  | { opId: string; table: TableName; op: 'upsert'; row: Row }
  | { opId: string; table: TableName; op: 'delete'; id: string }

export const NUMERIC: Record<TableName, string[]> = {
  accounts: ['opening_balance'],
  categories: [],
  platforms: [],
  assets: ['manual_price'],
  transactions: ['amount'],
  trades: ['quantity', 'price_per_unit', 'fee'],
  recurring_rules: ['amount', 'day_of_month'],
  recurring_checks: [],
  price_snapshots: ['price'],
  profiles: [],
  contributors: ['sort_order'],
}

export const isNetworkError = (msg: string) =>
  /fetch|network|failed to|load failed|timeout/i.test(msg)

export const isAuthError = (msg: string) =>
  /jwt|not authenticated|invalid_grant|session_not_found/i.test(msg)

/** Op yang gagal disinkronkan ke server, disimpan bersama pesan error dan status blokir. */
export type FailedOp = Op & { error: string; blocked: boolean; blockedBy?: string }

// Kolom FK per tabel yang bisa menunjuk ke op lain yang mungkin gagal
const FK_FIELDS: Partial<Record<TableName, string[]>> = {
  trades: ['asset_id', 'platform_id', 'account_id', 'contributor_id'],
  transactions: ['account_id', 'category_id', 'recurring_rule_id', 'trade_id'],
  recurring_checks: ['rule_id', 'transaction_id'],
}

/** Apakah upsert op bergantung pada salah satu ID yang gagal? */
export function blockedByIds(op: Op, failedIds: ReadonlySet<string>): boolean {
  if (op.op !== 'upsert' || failedIds.size === 0) return false
  return (FK_FIELDS[op.table] ?? []).some((f) => {
    const v = op.row[f]
    return typeof v === 'string' && failedIds.has(v)
  })
}

/**
 * Temukan opId dari failed op (non-blocked upsert) yang memblokir op ini.
 * Mengembalikan undefined jika op tidak terblokir.
 */
export function findBlocker(op: Op, failedOps: readonly FailedOp[]): string | undefined {
  if (op.op !== 'upsert') return undefined
  for (const field of FK_FIELDS[op.table] ?? []) {
    const val = op.row[field]
    if (typeof val !== 'string') continue
    const blocker = failedOps.find((f) => f.op === 'upsert' && !f.blocked && f.row.id === val)
    if (blocker) return blocker.opId
  }
  return undefined
}

export function emptyDB(): DB {
  return {
    accounts: [],
    categories: [],
    platforms: [],
    assets: [],
    transactions: [],
    trades: [],
    recurring_rules: [],
    recurring_checks: [],
    price_snapshots: [],
    profiles: [],
    contributors: [],
  }
}

export function normalize(table: TableName, rows: Record<string, unknown>[]): Row[] {
  return rows.map((r) => {
    const o = { ...r }
    for (const f of NUMERIC[table]) if (o[f] != null) o[f] = Number(o[f])
    return o as Row
  })
}

const rowsOf = (d: DB, t: TableName) => d[t] as unknown as Row[]
const setRows = (d: DB, t: TableName, rows: Row[]) => {
  ;(d as unknown as Record<TableName, Row[]>)[t] = rows
}

export function applyOp(base: DB, op: Op): DB {
  const next: DB = { ...base }
  const list = [...rowsOf(next, op.table)]
  if (op.op === 'upsert') {
    const i = list.findIndex((r) => r.id === op.row.id)
    if (i >= 0) list[i] = { ...list[i], ...op.row }
    else list.push(op.row)
  } else {
    const i = list.findIndex((r) => r.id === op.id)
    if (i >= 0) list.splice(i, 1)
  }
  setRows(next, op.table, list)
  return next
}

export function applyOps(base: DB, ops: Op[]): DB {
  return ops.reduce(applyOp, base)
}
