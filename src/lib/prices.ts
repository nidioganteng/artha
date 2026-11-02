// Harga pasar live lewat /api/prices (Vercel Function). Harga terakhir di-cache
// di localStorage sehingga tetap tampil saat offline.

export type PriceMap = Record<string, number>

const KEY = 'kq:prices'

/**
 * ID stabil untuk snapshot harga (asset_id × tanggal) yang disimpan di
 * localStorage. Dipakai agar panggilan `save('price_snapshots', ...)` berulang
 * di hari yang sama cuma meng-upsert satu baris, bukan membuat baris baru.
 *
 * Tabel price_snapshots sudah punya UNIQUE (user_id, asset_id, date), jadi
 * caching ID di client membuat upsert benar-benar idempotent di sisi server.
 */
export function getOrCreateSnapshotId(assetId: string, date: string): string {
  const key = `artha:snapid:${assetId}:${date}`
  try {
    const existing = localStorage.getItem(key)
    if (existing) return existing
    const id = crypto.randomUUID()
    localStorage.setItem(key, id)
    return id
  } catch {
    return crypto.randomUUID()
  }
}

interface Cached {
  prices: PriceMap
  at: string | null
}

export function cachedPrices(): Cached {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return JSON.parse(raw) as Cached
  } catch {
    // abaikan
  }
  return { prices: {}, at: null }
}

export async function fetchPrices(refs: string[]): Promise<{ prices: PriceMap; at: string | null; live: boolean }> {
  const old = cachedPrices()
  if (refs.length === 0) return { ...old, live: true }
  try {
    const r = await fetch(`/api/prices?pairs=${encodeURIComponent(refs.join(','))}`)
    if (!r.ok) throw new Error(String(r.status))
    const j = (await r.json()) as { prices: PriceMap; at: string }
    const merged = { prices: { ...old.prices, ...j.prices }, at: j.at }
    try {
      localStorage.setItem(KEY, JSON.stringify(merged))
    } catch {
      // abaikan
    }
    const gotAll = refs.every((x) => j.prices[x] != null)
    return { ...merged, live: gotAll }
  } catch {
    return { ...old, live: false }
  }
}
