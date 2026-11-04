import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { RefreshCw, Plus, ArrowDownLeft, ArrowUpRight, Pencil, Trash2 } from 'lucide-react'
import { useStore } from '../lib/store'
import { usePortfolio, toLite } from '../lib/usePortfolio'
import { computePosition } from '../lib/calc'
import { dateLabel, formatPercent, idr, num, todayISO } from '../lib/format'
import { getOrCreateSnapshotId } from '../lib/prices'
import { Sheet, EmptyState, Field, AmountText, MoneyInput, QuantityInput, ConfirmDialog } from '../ui'
import type { Trade } from '../lib/types'
import { InvestmentChart } from '../ui/InvestmentChart'

function plColor(n: number | null | undefined): string {
  if (n == null) return 'var(--text-2)'
  if (n > 0) return 'var(--income)'
  if (n < 0) return 'var(--expense)'
  return 'var(--text-2)'
}

function MetricCell({
  label,
  value,
  amount,
  signed = false,
  color,
  hint,
}: {
  label: string
  value?: string
  amount?: number
  signed?: boolean
  color?: string
  hint?: string
}) {
  const valStyle = { fontSize: 13, fontWeight: 600, color: color ?? 'var(--text-1)' } as const
  return (
    <div style={{ minWidth: 0 }}>
      <div className="muted" style={{ fontSize: 12, marginBottom: 2 }}>
        {label}
      </div>
      {amount !== undefined ? (
        <AmountText amount={amount} variant="md" signed={signed} style={valStyle} />
      ) : (
        <div style={{ fontFamily: 'var(--font-mono)', ...valStyle }}>{value}</div>
      )}
      {hint && (
        <div className="muted" style={{ fontSize: 11 }}>
          {hint}
        </div>
      )}
    </div>
  )
}

export default function Investments() {
  const { db, save, remove, failedIds } = useStore()
  const { rows, total, prices, live, at, loading, refresh } = usePortfolio()

  // Simpan snapshot harga live sekali per aset per hari ke tabel price_snapshots
  // supaya grafik perkembangan portofolio punya titik data per bulan.
  const snapshotKeys = useRef<Set<string>>(new Set())
  useEffect(() => {
    if (!live) return
    const today = todayISO()
    for (const asset of db.assets) {
      if (asset.price_source !== 'indodax' || !asset.price_ref) continue
      const price = prices[asset.price_ref]
      if (price == null || !Number.isFinite(price) || price <= 0) continue
      const dedup = `${asset.id}:${today}`
      if (snapshotKeys.current.has(dedup)) continue
      snapshotKeys.current.add(dedup)
      const id = getOrCreateSnapshotId(asset.id, today)
      save('price_snapshots', {
        id,
        asset_id: asset.id,
        date: today,
        price,
        source: 'live',
        created_at: new Date().toISOString(),
      })
    }
  }, [prices, live, db.assets, save])

  const [open, setOpen] = useState(false)
  const [editTrade, setEditTrade] = useState<Trade | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Trade | null>(null)
  const [assetId, setAssetId] = useState(() => db.assets[0]?.id ?? '')
  const [platformId, setPlatformId] = useState(() => db.platforms[0]?.id ?? '')

  const readLastAccount = (): string => {
    try {
      return localStorage.getItem('artha:last_account') ?? ''
    } catch {
      return ''
    }
  }
  const writeLastAccount = (id: string) => {
    try {
      localStorage.setItem('artha:last_account', id)
    } catch {
      // storage penuh / diblokir: abaikan
    }
  }

  const [accountId, setAccountId] = useState<string>(() => {
    const last = readLastAccount()
    if (last && db.accounts.some((a) => a.id === last)) return last
    return db.accounts[0]?.id ?? ''
  })
  const effectiveAssetId = db.assets.find((a) => a.id === assetId)?.id ?? db.assets[0]?.id ?? ''
  const effectivePlatformId =
    db.platforms.find((p) => p.id === platformId)?.id ?? db.platforms[0]?.id ?? ''
  const effectiveAccountId = db.accounts.find((a) => a.id === accountId)?.id ?? ''
  const [side, setSide] = useState<'buy' | 'sell'>('buy')
  const [qtyVal, setQtyVal] = useState<number | null>(null)
  const [mode, setMode] = useState<'unit' | 'total'>('total')
  const [priceVal, setPriceVal] = useState<number | null>(null)
  const [feeVal, setFeeVal] = useState<number | null>(null)
  const [date, setDate] = useState(todayISO())
  const [formError, setFormError] = useState('')
  const [manualVal, setManualVal] = useState<Record<string, number | null>>({})

  const asset = db.assets.find((a) => a.id === effectiveAssetId)
  const maxDecimals = asset?.asset_type === 'gold' ? 4 : 8

  function openAdd() {
    setEditTrade(null)
    setQtyVal(null)
    setPriceVal(null)
    setFeeVal(null)
    setDate(todayISO())
    // Pra-isi dari pilihan terakhir di localStorage
    const last = readLastAccount()
    if (last && db.accounts.some((a) => a.id === last)) setAccountId(last)
    else if (!db.accounts.some((a) => a.id === accountId))
      setAccountId(db.accounts[0]?.id ?? '')
    setFormError('')
    setOpen(true)
  }

  function openEditTrade(t: Trade) {
    setEditTrade(t)
    setAssetId(t.asset_id)
    setPlatformId(t.platform_id ?? '')
    setAccountId(t.account_id ?? '')
    setSide(t.side)
    setQtyVal(t.quantity)
    setMode('unit')
    setPriceVal(t.price_per_unit)
    setFeeVal(t.fee || null)
    setDate(t.traded_on)
    setFormError('')
    setOpen(true)
  }

  function submit(e: FormEvent) {
    e.preventDefault()
    const q = qtyVal ?? 0
    const p = priceVal ?? 0
    const f = feeVal ?? 0
    if (!asset) return setFormError('Pilih aset dulu (tambahkan di Pengaturan bila belum ada).')
    if (q <= 0) return setFormError('Jumlah unit harus lebih dari 0.')
    if (p < 0) return setFormError(
      mode === 'total' ? 'Total Rp tidak valid.' : 'Harga per unit tidak valid.',
    )
    if (f < 0) return setFormError('Biaya tidak valid.')
    const perUnit = mode === 'total' ? p / q : p

    // Rekening wajib untuk catatan baru; saat edit, boleh kosong (migrasi dari data lama)
    if (!editTrade && !effectiveAccountId) {
      setFormError(
        side === 'buy'
          ? 'Pilih sumber dana (rekening) dulu.'
          : 'Pilih rekening tujuan dulu.',
      )
      return
    }

    if (editTrade) {
      // Validate that position won't go negative
      const otherTrades = db.trades.filter(
        (t) => t.asset_id === effectiveAssetId && t.id !== editTrade.id,
      )
      const newTrade = {
        ...editTrade,
        side,
        quantity: q,
        price_per_unit: perUnit,
        fee: f,
        traded_on: date,
      }
      const allTrades = [...otherTrades, newTrade].sort((a, b) =>
        a.traded_on.localeCompare(b.traded_on),
      )
      let running = 0
      for (const t of allTrades) {
        if (t.side === 'buy') running += t.quantity
        else running -= t.quantity
        if (running < -0.000001) {
          setFormError(
            'Perubahan ini akan membuat posisi aset menjadi negatif. Periksa kembali jumlah dan jenis transaksi.',
          )
          return
        }
      }
      setFormError('')
      save('trades', {
        ...editTrade,
        asset_id: effectiveAssetId,
        platform_id: effectivePlatformId || null,
        account_id: effectiveAccountId || null,
        side,
        quantity: q,
        price_per_unit: perUnit,
        fee: f,
        traded_on: date,
      })
    } else {
      setFormError('')
      save('trades', {
        asset_id: effectiveAssetId,
        platform_id: effectivePlatformId || null,
        account_id: effectiveAccountId || null,
        side,
        quantity: q,
        price_per_unit: perUnit,
        fee: f,
        traded_on: date,
        note: null,
      })
    }
    if (effectiveAccountId) writeLastAccount(effectiveAccountId)
    setEditTrade(null)
    setOpen(false)
  }

  function saveManual(id: string) {
    const v = manualVal[id]
    if (v == null || v <= 0) return
    const a = db.assets.find((x) => x.id === id)
    if (!a) return
    save('assets', { ...a, manual_price: v, manual_price_at: new Date().toISOString() })
    setManualVal((m) => ({ ...m, [id]: null }))
  }

  // Total Rp saat mode = harga per unit
  const unitTotal = mode === 'unit' && qtyVal != null && priceVal != null && qtyVal > 0 && priceVal > 0
    ? qtyVal * priceVal
    : null

  const byPlatform = useMemo(() => {
    const out: {
      key: string
      platform: string
      asset: string
      unit: string
      qty: number
      avg: number
      cost: number
      value: number
    }[] = []
    for (const r of rows) {
      const groups = new Map<string, typeof r.trades>()
      for (const t of r.trades) {
        const k = t.platform_id ?? '-'
        groups.set(k, [...(groups.get(k) ?? []), t])
      }
      for (const [pid, trades] of groups) {
        const pos = computePosition(trades.map(toLite), r.price)
        if (pos.qty <= 0) continue
        out.push({
          key: `${r.asset.id}-${pid}`,
          platform: db.platforms.find((p) => p.id === pid)?.name ?? 'Tanpa platform',
          asset: r.asset.symbol,
          unit: r.asset.unit,
          qty: pos.qty,
          avg: pos.avgPrice,
          cost: pos.costBasis,
          value: pos.value,
        })
      }
    }
    return out.sort((a, b) => a.platform.localeCompare(b.platform))
  }, [rows, db.platforms])

  const history = useMemo(
    () => [...db.trades].sort((a, b) => b.traded_on.localeCompare(a.traded_on)),
    [db.trades],
  )

  const shortHistory = total.days < 365

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      {/* Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 20,
        }}
      >
        <h1
          style={{ fontWeight: 700, fontSize: 22, color: 'var(--text-1)', letterSpacing: '-0.02em' }}
        >
          Investasi
        </h1>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            className="btn-ghost"
            onClick={() => void refresh()}
            disabled={loading}
            aria-label="Perbarui harga"
            style={{ gap: 6, display: 'flex', alignItems: 'center' }}
          >
            <RefreshCw size={15} style={{ opacity: loading ? 0.5 : 1 }} />
            <span>{loading ? 'Memuat...' : 'Perbarui'}</span>
          </button>
          <button className="btn" onClick={openAdd} style={{ gap: 6 }}>
            <Plus size={16} />
            Catat DCA
          </button>
        </div>
      </div>

      {/* Price status */}
      <p className="muted" style={{ marginBottom: 20, fontSize: 12 }}>
        {live
          ? 'Harga pasar live.'
          : 'Tidak bisa ambil harga live, memakai harga terakhir tersimpan.'}
        {at ? ` Diperbarui ${new Date(at).toLocaleString('id-ID')}.` : ''}
      </p>

      {/* Grafik perkembangan — selalu ditampilkan (punya empty state sendiri) */}
      <div style={{ marginBottom: 16 }}>
        <InvestmentChart
          trades={db.trades}
          assets={db.assets}
          priceHistory={db.price_snapshots}
          currentPrices={prices}
          live={live}
          onOpenDCA={(assetId) => {
            if (assetId) setAssetId(assetId)
            openAdd()
          }}
        />
      </div>

      {rows.length === 0 ? (
        <EmptyState
          title="Belum ada aset"
          description="Tambahkan aset dan platform di Pengaturan, lalu catat pembelian DCA."
          action={
            <button className="btn" onClick={openAdd}>
              Catat DCA
            </button>
          }
        />
      ) : (
        <>
          {/* Ringkasan total */}
          <div className="card" style={{ marginBottom: 16 }}>
            <div
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: 'var(--text-3)',
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                marginBottom: 14,
              }}
            >
              Ringkasan Portofolio
            </div>
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: '14px 24px',
              }}
            >
              <MetricCell label="Total modal" amount={total.totalBought} />
              <MetricCell label="Nilai sekarang" amount={total.value} />
              <MetricCell
                label="Untung / rugi"
                amount={total.totalPL}
                signed
                color={plColor(total.totalPL)}
                hint={formatPercent(total.roi)}
              />
              <MetricCell
                label="CAGR"
                value={formatPercent(total.cagr)}
                color={plColor(total.cagr)}
                hint={shortHistory && total.cagr != null ? 'kurang akurat < 1 thn' : undefined}
              />
              <MetricCell
                label="XIRR (DCA)"
                value={formatPercent(total.xirr)}
                color={plColor(total.xirr)}
              />
            </div>
          </div>

          {/* Per aset */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 16 }}>
            {rows.map(({ asset: a, position: p, price, priceMissing }) => (
              <div key={a.id} className="card">
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'baseline',
                    justifyContent: 'space-between',
                    marginBottom: 14,
                  }}
                >
                  <div>
                    <span style={{ fontWeight: 600, fontSize: 15, color: 'var(--text-1)' }}>
                      {a.name}
                    </span>
                    <span className="muted" style={{ marginLeft: 6, fontSize: 13 }}>
                      ({a.symbol})
                    </span>
                  </div>
                  <span className="muted" style={{ fontSize: 11 }}>
                    {a.price_source === 'indodax' ? 'harga live' : 'harga manual'}
                  </span>
                </div>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(3, 1fr)',
                    gap: '12px 16px',
                  }}
                >
                  <MetricCell label="Jumlah" value={`${num(p.qty)} ${a.unit}`} />
                  <MetricCell label="Rata-rata beli" amount={p.avgPrice} />
                  <MetricCell label="Modal tersisa" amount={p.costBasis} />
                  <MetricCell
                    label="Harga sekarang"
                    amount={price ?? undefined}
                    value={price == null ? 'belum ada' : undefined}
                    color={priceMissing ? 'var(--warn)' : undefined}
                  />
                  <MetricCell label="Nilai sekarang" amount={p.value} />
                  <MetricCell
                    label="Untung / rugi"
                    amount={p.totalPL}
                    signed
                    color={plColor(p.totalPL)}
                    hint={formatPercent(p.roi)}
                  />
                  <MetricCell label="CAGR" value={formatPercent(p.cagr)} color={plColor(p.cagr)} />
                  <MetricCell label="XIRR" value={formatPercent(p.xirr)} color={plColor(p.xirr)} />
                  <MetricCell
                    label="Terealisasi"
                    amount={p.realized}
                    signed
                    color={plColor(p.realized)}
                  />
                </div>
                {a.price_source === 'manual' && (
                  <div style={{ marginTop: 14, display: 'flex', gap: 8 }}>
                    <div style={{ flex: 1 }}>
                      <MoneyInput
                        value={manualVal[a.id] ?? null}
                        onValueChange={(v) => setManualVal((m) => ({ ...m, [a.id]: v }))}
                        placeholder={`Harga per ${a.unit}`}
                      />
                    </div>
                    <button className="btn" type="button" onClick={() => saveManual(a.id)}>
                      Simpan
                    </button>
                  </div>
                )}
                {a.price_source === 'manual' && a.manual_price_at && (
                  <p className="muted" style={{ fontSize: 11, marginTop: 6 }}>
                    Harga terakhir diisi{' '}
                    {new Date(a.manual_price_at).toLocaleDateString('id-ID')}.
                  </p>
                )}
              </div>
            ))}
          </div>

          {/* Posisi per platform */}
          {byPlatform.length > 0 && (
            <div className="card" style={{ marginBottom: 16 }}>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: 'var(--text-3)',
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                  marginBottom: 12,
                }}
              >
                Posisi per Platform
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table
                  style={{
                    width: '100%',
                    minWidth: 480,
                    borderCollapse: 'collapse',
                    fontSize: 13,
                  }}
                >
                  <thead>
                    <tr>
                      {['Platform', 'Aset', 'Jumlah', 'Rata-rata', 'Modal', 'Nilai'].map((h) => (
                        <th
                          key={h}
                          className="muted"
                          style={{
                            textAlign:
                              h === 'Platform' || h === 'Aset' ? 'left' : ('right' as const),
                            paddingBottom: 8,
                            fontWeight: 500,
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {byPlatform.map((r, i) => (
                      <tr
                        key={r.key}
                        style={{ borderTop: i > 0 ? '1px solid var(--border)' : 'none' }}
                      >
                        <td style={{ padding: '8px 12px 8px 0' }}>{r.platform}</td>
                        <td style={{ padding: '8px 12px 8px 0' }}>{r.asset}</td>
                        <td
                          style={{
                            padding: '8px 0 8px 12px',
                            textAlign: 'right' as const,
                            fontFamily: 'var(--font-mono)',
                            fontSize: 12,
                          }}
                        >
                          {num(r.qty)} {r.unit}
                        </td>
                        <td
                          style={{
                            padding: '8px 0 8px 12px',
                            textAlign: 'right' as const,
                            fontFamily: 'var(--font-mono)',
                            fontSize: 12,
                          }}
                        >
                          {idr(r.avg)}
                        </td>
                        <td
                          style={{
                            padding: '8px 0 8px 12px',
                            textAlign: 'right' as const,
                            fontFamily: 'var(--font-mono)',
                            fontSize: 12,
                          }}
                        >
                          {idr(r.cost)}
                        </td>
                        <td
                          style={{
                            padding: '8px 0',
                            textAlign: 'right' as const,
                            fontFamily: 'var(--font-mono)',
                            fontSize: 12,
                          }}
                        >
                          {idr(r.value)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Riwayat */}
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div
              style={{
                padding: '14px 16px',
                borderBottom: '1px solid var(--border)',
              }}
            >
              <span style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-1)' }}>
                Riwayat
              </span>
            </div>
            {history.length === 0 ? (
              <p className="muted" style={{ padding: 16 }}>
                Belum ada catatan.
              </p>
            ) : (
              history.map((t, i) => {
                const a = db.assets.find((x) => x.id === t.asset_id)
                const pl = db.platforms.find((x) => x.id === t.platform_id)?.name
                const accName = t.account_id
                  ? db.accounts.find((x) => x.id === t.account_id)?.name
                  : null
                const unsaved = failedIds.has(t.id)
                const isBuy = t.side === 'buy'
                return (
                  <div
                    key={t.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '12px 16px',
                      borderTop: i > 0 ? '1px solid var(--border)' : 'none',
                      opacity: unsaved ? 0.6 : 1,
                    }}
                  >
                    <div
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: 'var(--radius-sm)',
                        background: isBuy ? 'var(--income)' : 'var(--expense)',
                        color: isBuy ? 'var(--income-fg)' : 'var(--expense-fg)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                      }}
                      aria-hidden="true"
                    >
                      {isBuy ? <ArrowDownLeft size={16} /> : <ArrowUpRight size={16} />}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          fontSize: 14,
                          fontWeight: 500,
                          color: 'var(--text-1)',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {isBuy ? 'Beli' : 'Jual'} {num(t.quantity)} {a?.symbol ?? a?.unit ?? ''}
                        {unsaved && (
                          <span style={{ marginLeft: 6, fontSize: 11, color: 'var(--warn)' }}>
                            belum tersimpan
                          </span>
                        )}
                      </div>
                      <div
                        className="muted"
                        style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}
                      >
                        <span>
                          {dateLabel(t.traded_on)}
                          {pl ? ` · ${pl}` : ''}
                          {accName ? ` · ${isBuy ? 'dari' : 'ke'} ${accName}` : ''}
                          {' · @ '}
                          {idr(t.price_per_unit)}
                        </span>
                        {!accName && (
                          <button
                            type="button"
                            className="chip chip-warn"
                            onClick={() => openEditTrade(t)}
                            style={{
                              border: 'none',
                              cursor: 'pointer',
                              fontFamily: 'inherit',
                              minHeight: 44,
                              padding: '0 12px',
                              alignSelf: 'center',
                            }}
                            aria-label="Tentukan sumber dana"
                          >
                            Belum ditentukan
                          </button>
                        )}
                      </div>
                    </div>
                    <div
                      style={{
                        fontFamily: 'var(--font-mono)',
                        fontWeight: 600,
                        fontSize: 14,
                        color: 'var(--text-1)',
                        flexShrink: 0,
                        textAlign: 'right' as const,
                      }}
                    >
                      {idr(t.quantity * t.price_per_unit + (isBuy ? t.fee : -t.fee))}
                    </div>
                    <button
                      className="btn-ghost"
                      aria-label="Edit catatan"
                      onClick={() => openEditTrade(t)}
                      style={{ padding: 8, minHeight: 44, minWidth: 44, border: 'none', color: 'var(--text-2)' }}
                    >
                      <Pencil size={15} />
                    </button>
                    <button
                      className="btn-ghost"
                      aria-label="Hapus catatan"
                      onClick={() => setDeleteTarget(t)}
                      style={{ padding: 8, minHeight: 44, minWidth: 44, border: 'none', color: 'var(--expense)' }}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                )
              })
            )}
          </div>
        </>
      )}

      {/* Sheet: Catat DCA / Edit */}
      <Sheet
        open={open}
        onClose={() => { setOpen(false); setEditTrade(null) }}
        title={editTrade
          ? (editTrade.side === 'buy' ? 'Edit Catatan DCA' : 'Edit Catatan Jual')
          : 'Catat DCA / Jual'}
        footer={
          <button type="submit" form="form-inv" className="btn" style={{ width: '100%' }}>
            {editTrade ? 'Simpan Perubahan' : 'Simpan'}
          </button>
        }
      >
        <form id="form-inv" onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Buy / Sell toggle */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {(['buy', 'sell'] as const).map((s) => {
              const active = side === s
              const activeColor = s === 'buy' ? 'var(--income)' : 'var(--expense)'
              const activeFg = s === 'buy' ? 'var(--income-fg)' : 'var(--expense-fg)'
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSide(s)}
                  style={{
                    padding: '10px 16px',
                    borderRadius: 'var(--radius-md)',
                    border: `2px solid ${active ? activeColor : 'var(--border)'}`,
                    background: active ? activeColor : 'transparent',
                    color: active ? activeFg : 'var(--text-2)',
                    fontWeight: 600,
                    fontSize: 14,
                    cursor: 'pointer',
                    minHeight: 44,
                    fontFamily: 'inherit',
                    transition: 'all 150ms ease-out',
                  }}
                >
                  {s === 'buy' ? 'Beli (DCA)' : 'Jual'}
                </button>
              )
            })}
          </div>

          <Field label="Aset" htmlFor="inv-asset">
            <select
              id="inv-asset"
              className="input"
              value={effectiveAssetId}
              onChange={(e) => setAssetId(e.target.value)}
              disabled={!!editTrade}
            >
              {db.assets.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} ({a.symbol})
                </option>
              ))}
            </select>
          </Field>

          <Field label="Platform" htmlFor="inv-plat">
            <select
              id="inv-plat"
              className="input"
              value={effectivePlatformId}
              onChange={(e) => setPlatformId(e.target.value)}
            >
              <option value="">Tanpa platform</option>
              {db.platforms.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </Field>

          <Field label={side === 'buy' ? 'Sumber dana' : 'Masuk ke rekening'} htmlFor="inv-acc">
            <select
              id="inv-acc"
              className="input"
              value={effectiveAccountId}
              onChange={(e) => setAccountId(e.target.value)}
            >
              <option value="">Belum ditentukan</option>
              {db.accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
            {db.accounts.length === 0 && (
              <p className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                Belum ada rekening. Tambahkan di Pengaturan.
              </p>
            )}
          </Field>

          <Field label={`Jumlah didapat (${asset?.unit ?? 'unit'})`} htmlFor="inv-qty">
            <QuantityInput
              id="inv-qty"
              value={qtyVal}
              onValueChange={setQtyVal}
              maxDecimals={maxDecimals}
              placeholder="0,00012345"
            />
          </Field>

          <Field
            label={mode === 'total' ? 'Total yang dibayar (Rp)' : 'Harga per unit (Rp)'}
            htmlFor="inv-px"
          >
            <MoneyInput
              id="inv-px"
              value={priceVal}
              onValueChange={setPriceVal}
              placeholder={mode === 'total' ? '500.000' : '800.000.000'}
            />
            {unitTotal != null && (
              <p className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                Total: {idr(unitTotal)}
              </p>
            )}
            <button
              type="button"
              style={{
                marginTop: 6,
                fontSize: 12,
                color: 'var(--primary)',
                background: 'none',
                border: 'none',
                padding: 0,
                cursor: 'pointer',
                textDecoration: 'underline',
                fontFamily: 'inherit',
              }}
              onClick={() => { setMode(mode === 'total' ? 'unit' : 'total'); setPriceVal(null) }}
            >
              {mode === 'total' ? 'Isi harga per unit saja' : 'Isi total Rp saja'}
            </button>
          </Field>

          <Field label="Biaya / fee (Rp, opsional)" htmlFor="inv-fee">
            <MoneyInput
              id="inv-fee"
              value={feeVal}
              onValueChange={setFeeVal}
              placeholder="0"
            />
          </Field>

          <Field label="Tanggal" htmlFor="inv-dt">
            <input
              id="inv-dt"
              type="date"
              className="input"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </Field>

          {formError && (
            <p style={{ fontSize: 13, color: 'var(--expense)', marginTop: -8 }}>{formError}</p>
          )}

        </form>
      </Sheet>

      {/* Confirm delete dialog */}
      <ConfirmDialog
        open={deleteTarget !== null}
        title="Hapus Catatan"
        message="Hapus catatan investasi ini?"
        onConfirm={() => {
          if (deleteTarget) remove('trades', deleteTarget.id)
          setDeleteTarget(null)
        }}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  )
}
