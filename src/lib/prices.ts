// Harga pasar live lewat /api/prices (Vercel Function). Harga terakhir di-cache
// di localStorage sehingga tetap tampil saat offline.

export type PriceMap = Record<string, number>

const KEY = 'kq:prices'

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
