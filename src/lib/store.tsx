import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { supabase } from './supabase'
import {
  applyOp,
  applyOps,
  emptyDB,
  findBlocker,
  isAuthError,
  isNetworkError,
  normalize,
  type FailedOp,
  type Op,
  type Row,
} from './sync'
import type { DB, TableName } from './types'

// Store lokal-dulu: semua data disimpan di memori + localStorage, perubahan masuk antrean
// dan dikirim ke Supabase saat online. Aplikasi tetap bisa dipakai tanpa internet.
// Setiap baris punya UUID buatan client sehingga sinkronisasi ulang aman (upsert, tidak dobel).

const TABLES: TableName[] = [
  'accounts',
  'categories',
  'platforms',
  'assets',
  'transactions',
  'trades',
  'recurring_rules',
  'recurring_checks',
  'price_snapshots',
  'profiles',
  'contributors',
  'budgets',
]

// Tabel yang kalau belum ada di database tidak mematikan aplikasi — cukup pakai
// array kosong. Dipakai untuk migrasi lunak: fitur baru bisa dideploy sebelum
// user menjalankan migrasi SQL-nya.
const OPTIONAL_TABLES: ReadonlySet<TableName> = new Set<TableName>(['price_snapshots', 'profiles', 'contributors', 'budgets'])

const isMissingRelationError = (msg: string) =>
  /relation .* does not exist|could not find the table|schema cache/i.test(msg)

function readJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}
function writeJSON(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // penyimpanan penuh / diblokir: abaikan
  }
}

const uuid = () => crypto.randomUUID()

interface Store {
  userId: string
  db: DB
  ready: boolean
  online: boolean
  syncing: boolean
  pending: number
  failed: number
  failedOps: FailedOp[]
  failedIds: ReadonlySet<string>
  error: string | null
  save: (table: TableName, row: Record<string, unknown>) => string
  remove: (table: TableName, id: string) => void
  refresh: () => Promise<void>
  retryFailed: (opId: string) => void
  discardFailed: (opId: string) => void
  clearFailed: () => void
}

const Ctx = createContext<Store | null>(null)

export { type FailedOp }

export function useStore(): Store {
  const s = useContext(Ctx)
  if (!s) throw new Error('useStore harus di dalam StoreProvider')
  return s
}

export function StoreProvider({ userId, children }: { userId: string; children: ReactNode }) {
  const cacheKey = `kq:cache:${userId}`
  const queueKey = `kq:queue:${userId}`
  const failKey = `kq:failed:${userId}`

  const serverRef = useRef<DB>(readJSON<DB>(cacheKey, emptyDB()))
  const queueRef = useRef<Op[]>(readJSON<Op[]>(queueKey, []))
  // Migrasi data lama (Op[]) yang belum punya field error/blocked
  const failedRef = useRef<FailedOp[]>(
    readJSON<FailedOp[]>(failKey, []).map((f) => ({ ...f, error: f.error ?? '', blocked: !!f.blocked })),
  )
  const syncingRef = useRef(false)
  const versionRef = useRef(0)

  const [db, setDb] = useState<DB>(() => applyOps(serverRef.current, queueRef.current))
  const [ready, setReady] = useState(() => Object.values(serverRef.current).some((l) => l.length > 0))
  const [online, setOnline] = useState(() => navigator.onLine)
  const [syncing, setSyncing] = useState(false)
  const [pending, setPending] = useState(queueRef.current.length)
  const [failed, setFailed] = useState(failedRef.current.length)
  const [failedOps, setFailedOps] = useState<FailedOp[]>(() => [...failedRef.current])
  const [error, setError] = useState<string | null>(null)

  const rebuild = useCallback(() => {
    // Aplikasikan antrean lalu baris gagal (upsert) agar tetap tampil di UI sebagai "belum tersimpan"
    let base = applyOps(serverRef.current, queueRef.current)
    for (const f of failedRef.current) {
      if (f.op === 'upsert') {
        base = applyOp(base, { opId: f.opId, table: f.table, op: 'upsert', row: f.row })
      }
    }
    setDb(base)
    setPending(queueRef.current.length)
    setFailed(failedRef.current.length)
    setFailedOps([...failedRef.current])
  }, [])

  const persistQueue = useCallback(() => {
    writeJSON(queueKey, queueRef.current)
    writeJSON(failKey, failedRef.current)
  }, [queueKey, failKey])

  /** Kirim antrean ke Supabase secara berurutan. Berhenti saat jaringan putus atau auth gagal. */
  const flush = useCallback(async (): Promise<boolean> => {
    if (syncingRef.current) return false
    syncingRef.current = true
    setSyncing(true)
    let clean = true
    try {
      while (queueRef.current.length > 0) {
        const op = queueRef.current[0]

        // Cek apakah op ini diblokir oleh op yang sudah gagal sebelumnya
        const blockerId = findBlocker(op, failedRef.current)
        if (blockerId !== undefined) {
          queueRef.current.shift()
          failedRef.current.push({ ...op, error: 'Bergantung pada op yang gagal', blocked: true, blockedBy: blockerId })
          persistQueue()
          rebuild()
          continue
        }

        let msg: string | null = null
        try {
          const res =
            op.op === 'upsert'
              ? await supabase.from(op.table).upsert(op.row, { onConflict: 'id' })
              : await supabase.from(op.table).delete().eq('id', op.id)
          msg = res.error ? res.error.message : null
        } catch (e) {
          msg = e instanceof Error ? e.message : String(e)
        }

        // Error jaringan atau autentikasi → sementara, hentikan antrean (jangan buang op)
        if (msg && (isNetworkError(msg) || isAuthError(msg) || !navigator.onLine)) {
          clean = false
          break
        }

        // Tabel opsional yang belum ada: perlakukan sebagai sukses lokal.
        // Op dikeluarkan dari antrean, serverRef diperbarui, tidak dimarkah gagal.
        if (msg && OPTIONAL_TABLES.has(op.table) && isMissingRelationError(msg)) {
          queueRef.current.shift()
          serverRef.current = applyOp(serverRef.current, op)
          writeJSON(cacheKey, serverRef.current)
          versionRef.current++
          persistQueue()
          rebuild()
          continue
        }

        queueRef.current.shift()
        if (!msg) {
          // Sukses: perbarui snapshot server agar rebuild tidak kehilangan baris
          serverRef.current = applyOp(serverRef.current, op)
          writeJSON(cacheKey, serverRef.current)
          versionRef.current++
        } else {
          // Error permanen (constraint, RLS, dsb): tandai gagal, baris tetap di UI
          failedRef.current.push({ ...op, error: msg, blocked: false })
          setError(msg)
        }
        persistQueue()
        rebuild()
      }
    } finally {
      syncingRef.current = false
      setSyncing(false)
    }
    return clean
  }, [cacheKey, persistQueue, rebuild])

  const refresh = useCallback(async () => {
    if (!navigator.onLine) {
      // Offline saat pertama kali: tandai ready agar halaman tampil (keadaan kosong atau cache)
      setReady(true)
      return
    }
    const clean = await flush()
    if (!clean) {
      setReady(true)
      return
    }
    const snap = versionRef.current
    const results = await Promise.all(TABLES.map((t) => supabase.from(t).select('*')))
    if (versionRef.current !== snap) return
    // Error dari tabel opsional yang belum ada di DB (mis. price_snapshots sebelum
    // migrasi dijalankan) tidak fatal — abaikan dan pakai array kosong.
    const bad = results.find((r, i) => {
      if (!r.error) return false
      const table = TABLES[i]
      if (OPTIONAL_TABLES.has(table) && isMissingRelationError(r.error.message)) {
        if (typeof console !== 'undefined') {
          console.warn(`[store] tabel ${table} belum ada di database, dilewati.`)
        }
        return false
      }
      return true
    })
    if (bad?.error) {
      setReady(true)
      if (!isNetworkError(bad.error.message)) setError(bad.error.message)
      return
    }
    const fresh = emptyDB()
    TABLES.forEach((t, i) => {
      const r = results[i]
      if (r.error) {
        // Tabel opsional yang tidak ada: lewati, biarkan array kosong
        return
      }
      const rows = (r.data ?? []) as Record<string, unknown>[]
      ;(fresh as unknown as Record<string, unknown>)[t] = normalize(t, rows)
    })
    serverRef.current = fresh
    writeJSON(cacheKey, fresh)
    setError(null)
    setReady(true)
    rebuild()
  }, [flush, cacheKey, rebuild])

  const save = useCallback(
    (table: TableName, row: Record<string, unknown>) => {
      const id = (row.id as string | undefined) ?? uuid()
      const full: Row = { ...row, id, user_id: userId }
      queueRef.current.push({ opId: uuid(), table, op: 'upsert', row: full })
      persistQueue()
      rebuild()
      void flush()
      return id
    },
    [userId, persistQueue, rebuild, flush],
  )

  const remove = useCallback(
    (table: TableName, id: string) => {
      queueRef.current.push({ opId: uuid(), table, op: 'delete', id })
      persistQueue()
      rebuild()
      void flush()
    },
    [persistQueue, rebuild, flush],
  )

  /** Pindahkan op gagal (dan yang diblokirnya) kembali ke antrean lalu coba lagi. */
  const retryFailed = useCallback(
    (opId: string) => {
      const target = failedRef.current.find((f) => f.opId === opId)
      if (!target) return
      const cascaded = failedRef.current.filter((f) => f.blockedBy === opId)
      failedRef.current = failedRef.current.filter((f) => f.opId !== opId && f.blockedBy !== opId)
      const toRetry: Op[] = [target, ...cascaded].map((f): Op => {
        if (f.op === 'upsert') return { opId: f.opId, table: f.table, op: 'upsert', row: f.row }
        return { opId: f.opId, table: f.table, op: 'delete', id: f.id }
      })
      queueRef.current = [...toRetry, ...queueRef.current]
      persistQueue()
      rebuild()
      void flush()
    },
    [persistQueue, rebuild, flush],
  )

  /** Buang op gagal (dan yang diblokirnya) — baris akan hilang dari UI. */
  const discardFailed = useCallback(
    (opId: string) => {
      failedRef.current = failedRef.current.filter((f) => f.opId !== opId && f.blockedBy !== opId)
      persistQueue()
      rebuild()
    },
    [persistQueue, rebuild],
  )

  /** Buang semua op gagal sekaligus. */
  const clearFailed = useCallback(() => {
    failedRef.current = []
    persistQueue()
    setError(null)
    rebuild()
  }, [persistQueue, rebuild])

  useEffect(() => {
    void refresh()
    const up = () => {
      setOnline(true)
      void refresh()
    }
    const down = () => setOnline(false)
    const visible = () => {
      if (document.visibilityState === 'visible') void refresh()
    }
    window.addEventListener('online', up)
    window.addEventListener('offline', down)
    document.addEventListener('visibilitychange', visible)
    return () => {
      window.removeEventListener('online', up)
      window.removeEventListener('offline', down)
      document.removeEventListener('visibilitychange', visible)
    }
  }, [refresh])

  const failedIds = useMemo(
    () =>
      new Set(
        failedOps
          .filter((f): f is FailedOp & { op: 'upsert' } => f.op === 'upsert')
          .map((f) => f.row.id as string),
      ),
    [failedOps],
  )

  const value = useMemo<Store>(
    () => ({
      userId,
      db,
      ready,
      online,
      syncing,
      pending,
      failed,
      failedOps,
      failedIds,
      error,
      save,
      remove,
      refresh,
      retryFailed,
      discardFailed,
      clearFailed,
    }),
    [userId, db, ready, online, syncing, pending, failed, failedOps, failedIds, error, save, remove, refresh, retryFailed, discardFailed, clearFailed],
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
