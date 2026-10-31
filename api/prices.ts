// Vercel Serverless Function: GET /api/prices?pairs=btcidr,ethidr
// Mengambil harga terakhir dari ticker publik Indodax (tanpa API key).
// Dijalankan di server supaya tidak terkena masalah CORS di browser.

interface Req {
  query: Record<string, string | string[] | undefined>
}
interface Res {
  setHeader(name: string, value: string): void
  status(code: number): Res
  json(body: unknown): void
}

export default async function handler(req: Req, res: Res) {
  // Hanya izinkan GET
  if ((req as any).method && (req as any).method !== 'GET') {
    res.status(405).json({ error: 'Method Not Allowed' })
    return
  }

  const raw = Array.isArray(req.query.pairs) ? req.query.pairs.join(',') : req.query.pairs ?? 'btcidr'
  const pairs = raw
    .split(',')
    .map((p) => p.trim().toLowerCase())
    .filter((p) => /^[a-z0-9_]{3,20}$/.test(p))
    .slice(0, 10)

  const prices: Record<string, number> = {}

  await Promise.all(
    pairs.map(async (pair) => {
      try {
        const controller = new AbortController()
        const timeout = setTimeout(() => controller.abort(), 5000)
        const r = await fetch(`https://indodax.com/api/ticker/${pair}`, {
          headers: { accept: 'application/json' },
          signal: controller.signal,
        })
        clearTimeout(timeout)
        if (!r.ok) return
        const j = (await r.json()) as { ticker?: { last?: string } }
        const last = Number(j?.ticker?.last)
        if (Number.isFinite(last) && last > 0) prices[pair] = last
      } catch {
        // pair yang gagal tidak dimasukkan, client memakai harga cache
      }
    }),
  )

  res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=60')
  res.status(200).json({ prices, at: new Date().toISOString() })
}
