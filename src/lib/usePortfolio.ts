import { useCallback, useEffect, useMemo, useState } from 'react'
import { computePosition, summarize, type Position, type Summary, type TradeLite } from './calc'
import { cachedPrices, fetchPrices, type PriceMap } from './prices'
import { useStore } from './store'
import type { Asset, Trade } from './types'

export const toLite = (t: Trade): TradeLite => ({
  side: t.side,
  quantity: t.quantity,
  price: t.price_per_unit,
  fee: t.fee,
  date: t.traded_on,
})

export interface AssetRow {
  asset: Asset
  trades: Trade[]
  price: number | null
  priceMissing: boolean
  position: Position
}

export function usePortfolio() {
  const { db } = useStore()
  const [prices, setPrices] = useState<PriceMap>(() => cachedPrices().prices)
  const [at, setAt] = useState<string | null>(() => cachedPrices().at)
  const [live, setLive] = useState(true)
  const [loading, setLoading] = useState(false)

  const refs = useMemo(
    () => [...new Set(db.assets.filter((a) => a.price_source === 'indodax' && a.price_ref).map((a) => a.price_ref as string))],
    [db.assets],
  )
  const refsKey = refs.join(',')

  const refresh = useCallback(async () => {
    setLoading(true)
    const r = await fetchPrices(refsKey ? refsKey.split(',') : [])
    setPrices(r.prices)
    setAt(r.at)
    setLive(r.live)
    setLoading(false)
  }, [refsKey])

  useEffect(() => {
    void refresh()
    const id = window.setInterval(() => void refresh(), 120_000)
    return () => window.clearInterval(id)
  }, [refresh])

  const rows = useMemo<AssetRow[]>(() => {
    return db.assets
      .map((asset) => {
        const trades = db.trades.filter((t) => t.asset_id === asset.id)
        const price = asset.price_source === 'indodax' ? (asset.price_ref ? prices[asset.price_ref] ?? null : null) : asset.manual_price
        const position = computePosition(trades.map(toLite), price)
        return { asset, trades, price, priceMissing: price == null && position.qty > 0, position }
      })
      .filter((r) => r.trades.length > 0 || r.asset.price_source === 'indodax' || r.asset.manual_price != null)
  }, [db.assets, db.trades, prices])

  const total = useMemo<Summary>(
    () => summarize(rows.map((r) => r.position), db.trades.map(toLite)),
    [rows, db.trades],
  )

  return { rows, total, prices, at, live, loading, refresh }
}
