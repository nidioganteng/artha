import { useEffect, useMemo, useRef, useState } from 'react'
import type { Trade, Asset, PriceSnapshot } from '../lib/types'
import { portfolioSeries, type SeriesPoint } from '../lib/calc'
import { formatShort } from '../lib/amount'
import { formatPercent, idr, todayISO } from '../lib/format'

// ──────────────────────────────────────────────────────
// Hook: lebar container via ResizeObserver (SVG viewBox 1:1)
// ──────────────────────────────────────────────────────
function useElementWidth(ref: { current: HTMLDivElement | null }) {
  const [width, setWidth] = useState(0)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    setWidth(el.getBoundingClientRect().width)
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) setWidth(entry.contentRect.width)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [ref])
  return width
}

type Period = 6 | 12 | 'all'

function readPeriod(): Period {
  try {
    const v = localStorage.getItem('artha:chart:period')
    if (v === '6') return 6
    if (v === '12') return 12
    if (v === 'all') return 'all'
  } catch {
    // abaikan
  }
  return 12
}

function readAsset(): string {
  try {
    return localStorage.getItem('artha:chart:asset') ?? 'all'
  } catch {
    return 'all'
  }
}

export function InvestmentChart({
  trades,
  assets,
  priceHistory,
  currentPrices,
  live,
}: {
  trades: Trade[]
  assets: Asset[]
  priceHistory: PriceSnapshot[]
  currentPrices: Record<string, number>
  live: boolean
}) {
  const today = todayISO()

  const [filterAsset, setFilterAsset] = useState<string>(() => readAsset())
  const [period, setPeriod] = useState<Period>(() => readPeriod())
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null)
  const [showTable, setShowTable] = useState(false)

  const wrapRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const W = useElementWidth(wrapRef)
  const H = 240

  useEffect(() => {
    try {
      localStorage.setItem('artha:chart:asset', filterAsset)
    } catch {
      // abaikan
    }
  }, [filterAsset])

  useEffect(() => {
    try {
      localStorage.setItem('artha:chart:period', String(period))
    } catch {
      // abaikan
    }
  }, [period])

  // Jika aset terpilih tidak lagi ada di daftar (dihapus), kembali ke 'all'
  useEffect(() => {
    if (filterAsset === 'all') return
    if (!assets.some((a) => a.id === filterAsset)) setFilterAsset('all')
  }, [assets, filterAsset])

  // Siapkan mapping harga live symbol → nilai (saat ini usePortfolio
  // menyediakan prices via price_ref, bukan symbol; kita konversi di sini)
  const priceBySymbol = useMemo<Record<string, number>>(() => {
    const out: Record<string, number> = {}
    for (const a of assets) {
      const ref = a.price_ref
      if (ref) {
        const p = (currentPrices as Record<string, number>)[ref]
        if (p != null && Number.isFinite(p) && p > 0) out[a.symbol] = p
      }
      // Fallback: manual_price di aset itu sendiri
      if (!out[a.symbol] && a.manual_price != null && a.manual_price > 0) {
        out[a.symbol] = a.manual_price
      }
    }
    return out
  }, [assets, currentPrices])

  const series = useMemo<SeriesPoint[]>(() => {
    return portfolioSeries(
      trades,
      assets,
      priceHistory,
      priceBySymbol,
      filterAsset,
      period,
      today,
    )
  }, [trades, assets, priceHistory, priceBySymbol, filterAsset, period, today])

  // Reset hoveredIdx jika data berubah
  useEffect(() => {
    setHoveredIdx((idx) => (idx != null && idx < series.length ? idx : null))
  }, [series.length])

  // ────── Empty states ──────
  if (trades.length === 0) {
    return (
      <div className="card bento-full" data-testid="investment-chart">
        <h2
          style={{
            fontSize: 15,
            fontWeight: 700,
            color: 'var(--text-1)',
            letterSpacing: '-0.01em',
            margin: '0 0 8px 0',
          }}
        >
          Perkembangan Investasi
        </h2>
        <p className="muted" style={{ fontSize: 13 }}>
          Belum ada catatan investasi. Catat DCA pertama untuk mulai melihat perkembangan.
        </p>
      </div>
    )
  }

  if (series.length === 0) {
    return (
      <div className="card bento-full" data-testid="investment-chart">
        <h2
          style={{
            fontSize: 15,
            fontWeight: 700,
            color: 'var(--text-1)',
            letterSpacing: '-0.01em',
            margin: '0 0 8px 0',
          }}
        >
          Perkembangan Investasi
        </h2>
        <p className="muted" style={{ fontSize: 13 }}>
          Belum ada data cukup untuk aset terpilih.
        </p>
      </div>
    )
  }

  const last = series[series.length - 1]
  const secondLast = series.length >= 2 ? series[series.length - 2] : null
  const momValue = secondLast && secondLast.value > 0
    ? (last.value - secondLast.value) / secondLast.value
    : null
  const anyEstimate = series.some((p) => p.quality === 'estimate')

  // ──────────────────────────────────────────────────────
  // Geometri SVG — viewBox 1:1 dengan W × H (tanpa preserveAspectRatio="none")
  // ──────────────────────────────────────────────────────
  const padL = 8
  const padR = 8
  const padT = 10
  const padB = 28
  const chartW = Math.max(50, W - padL - padR)
  const chartH = H - padT - padB

  const maxVal = Math.max(
    1,
    ...series.map((p) => Math.max(p.value, p.cost)),
  )
  const yMax = maxVal * 1.08
  const xFor = (i: number) =>
    series.length === 1 ? padL + chartW / 2 : padL + (i / (series.length - 1)) * chartW
  const yFor = (v: number) => padT + chartH - (v / yMax) * chartH

  const valuePath = series
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${xFor(i).toFixed(2)} ${yFor(p.value).toFixed(2)}`)
    .join(' ')
  const costPath = series
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${xFor(i).toFixed(2)} ${yFor(p.cost).toFixed(2)}`)
    .join(' ')

  // Area antara Nilai dan Modal — di-fill dengan warna income/expense per titik
  // sederhana: satu polygon dengan Nilai di atas dan Modal di bawah (atau sebaliknya)
  const areaPath = (() => {
    if (series.length < 2) return ''
    const up: string[] = []
    for (let i = 0; i < series.length; i++) {
      up.push(`${i === 0 ? 'M' : 'L'} ${xFor(i).toFixed(2)} ${yFor(series[i].value).toFixed(2)}`)
    }
    for (let i = series.length - 1; i >= 0; i--) {
      up.push(`L ${xFor(i).toFixed(2)} ${yFor(series[i].cost).toFixed(2)}`)
    }
    up.push('Z')
    return up.join(' ')
  })()

  // Tick Y sumbu (4 label)
  const yTicks = [0, 0.33, 0.66, 1].map((t) => yMax * t)

  // Label X: tampilkan setiap N langkah agar tidak padat
  const xLabelStep = Math.max(1, Math.ceil(series.length / 6))
  const monthLabel = (mk: string) => {
    const [, mm] = mk.split('-')
    const names = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des']
    return names[Number(mm)] || mk
  }

  // Posisi tooltip ke pixel container
  const tipIdx = hoveredIdx
  const tip = tipIdx != null && series[tipIdx]
    ? { px: xFor(tipIdx), py: yFor(series[tipIdx].value), p: series[tipIdx] }
    : null

  // Keyboard navigasi
  function onSvgKey(e: React.KeyboardEvent<SVGSVGElement>) {
    if (series.length === 0) return
    if (e.key === 'ArrowLeft') {
      e.preventDefault()
      setHoveredIdx((idx) => {
        const base = idx ?? series.length - 1
        return Math.max(0, base - 1)
      })
    } else if (e.key === 'ArrowRight') {
      e.preventDefault()
      setHoveredIdx((idx) => {
        const base = idx ?? 0
        return Math.min(series.length - 1, base + 1)
      })
    } else if (e.key === 'Home') {
      e.preventDefault()
      setHoveredIdx(0)
    } else if (e.key === 'End') {
      e.preventDefault()
      setHoveredIdx(series.length - 1)
    } else if (e.key === 'Escape') {
      setHoveredIdx(null)
    }
  }

  function pointerToIdx(clientX: number): number {
    if (!svgRef.current) return 0
    const rect = svgRef.current.getBoundingClientRect()
    const x = clientX - rect.left
    const t = (x - padL) / Math.max(1, chartW)
    const idx = Math.round(t * (series.length - 1))
    return Math.max(0, Math.min(series.length - 1, idx))
  }

  return (
    <div className="card bento-full" data-testid="investment-chart">
      {/* Judul + ringkasan */}
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 12,
          flexWrap: 'wrap',
          marginBottom: 12,
        }}
      >
        <div style={{ minWidth: 0 }}>
          <h2
            style={{
              fontSize: 15,
              fontWeight: 700,
              color: 'var(--text-1)',
              letterSpacing: '-0.01em',
              margin: '0 0 4px 0',
            }}
          >
            Perkembangan Investasi
          </h2>
          <div
            style={{
              display: 'flex',
              gap: 16,
              flexWrap: 'wrap',
              alignItems: 'baseline',
            }}
          >
            <div
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 20,
                fontWeight: 700,
                color: 'var(--text-1)',
              }}
            >
              {idr(last.value)}
            </div>
            {momValue != null && (
              <div
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 13,
                  fontWeight: 600,
                  color: momValue >= 0 ? 'var(--income)' : 'var(--expense)',
                }}
                aria-label={`Perubahan bulan ini ${formatPercent(momValue)}`}
              >
                {momValue >= 0 ? '+' : ''}
                {formatPercent(momValue)}
              </div>
            )}
            <div
              className="muted"
              style={{ fontSize: 12 }}
              aria-label={`Total untung rugi ${idr(last.pl)}`}
            >
              U/R{' '}
              <span
                style={{
                  color: last.pl >= 0 ? 'var(--income)' : 'var(--expense)',
                  fontWeight: 600,
                  fontFamily: 'var(--font-mono)',
                }}
              >
                {last.pl >= 0 ? '+' : ''}
                {formatShort(last.pl)}
              </span>
            </div>
          </div>
        </div>

        {/* Kontrol: filter aset + periode */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <select
            className="input"
            value={filterAsset}
            onChange={(e) => setFilterAsset(e.target.value)}
            aria-label="Filter aset"
            style={{ minHeight: 36, padding: '6px 12px', fontSize: 13, minWidth: 120 }}
          >
            <option value="all">Semua aset</option>
            {assets.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
          <div
            role="radiogroup"
            aria-label="Rentang waktu"
            style={{
              display: 'inline-flex',
              gap: 2,
              background: 'var(--surface-2)',
              borderRadius: 'var(--radius-sm)',
              padding: 2,
              border: '1px solid var(--border)',
            }}
          >
            {([6, 12, 'all'] as const).map((p) => {
              const active = period === p
              return (
                <button
                  key={String(p)}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => setPeriod(p)}
                  style={{
                    minHeight: 32,
                    padding: '4px 10px',
                    fontSize: 12,
                    fontWeight: 600,
                    fontFamily: 'inherit',
                    background: active ? 'var(--surface)' : 'transparent',
                    color: active ? 'var(--text-1)' : 'var(--text-2)',
                    border: active ? '1px solid var(--border)' : '1px solid transparent',
                    borderRadius: 'calc(var(--radius-sm) - 2px)',
                    cursor: 'pointer',
                  }}
                >
                  {p === 'all' ? 'Semua' : `${p}B`}
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {/* SVG grafik */}
      <div ref={wrapRef} style={{ width: '100%', position: 'relative' }}>
        {W > 0 && (
          <svg
            ref={svgRef}
            width={W}
            height={H}
            viewBox={`0 0 ${W} ${H}`}
            role="img"
            tabIndex={0}
            aria-label="Grafik perkembangan nilai dan modal portofolio"
            onKeyDown={onSvgKey}
            onPointerMove={(e) => setHoveredIdx(pointerToIdx(e.clientX))}
            onPointerLeave={() => setHoveredIdx(null)}
            style={{ display: 'block', outline: 'none', touchAction: 'pan-y' }}
          >
            {/* grid Y */}
            {yTicks.map((v, i) => (
              <line
                key={`gy-${i}`}
                x1={padL}
                x2={padL + chartW}
                y1={yFor(v)}
                y2={yFor(v)}
                stroke="var(--border)"
                strokeWidth={1}
                strokeDasharray={i === 0 ? '0' : '2 3'}
              />
            ))}

            {/* label Y */}
            {yTicks.map((v, i) => (
              <text
                key={`ty-${i}`}
                x={padL + 2}
                y={yFor(v) - 3}
                fontSize="10"
                fill="var(--text-3)"
                style={{ fontFamily: 'var(--font-mono)' }}
              >
                {formatShort(v)}
              </text>
            ))}

            {/* area antara nilai dan modal */}
            {areaPath && (
              <path
                d={areaPath}
                fill={last.pl >= 0 ? 'var(--income)' : 'var(--expense)'}
                fillOpacity={0.08}
                stroke="none"
              />
            )}

            {/* garis modal (dashed) */}
            <path
              d={costPath}
              fill="none"
              stroke="var(--text-3)"
              strokeWidth={1.5}
              strokeDasharray="4 3"
            />

            {/* garis nilai */}
            <path
              d={valuePath}
              fill="none"
              stroke="var(--primary)"
              strokeWidth={2}
            />

            {/* titik-titik nilai (filled market, hollow estimate) */}
            {series.map((p, i) => {
              const cx = xFor(i)
              const cy = yFor(p.value)
              const isMarket = p.quality === 'market'
              return (
                <circle
                  key={`pt-${i}`}
                  cx={cx}
                  cy={cy}
                  r={i === hoveredIdx ? 5 : 3.5}
                  fill={isMarket ? 'var(--primary)' : 'var(--surface)'}
                  stroke="var(--primary)"
                  strokeWidth={1.5}
                />
              )
            })}

            {/* label X */}
            {series.map((p, i) => {
              if (i % xLabelStep !== 0 && i !== series.length - 1) return null
              return (
                <text
                  key={`tx-${i}`}
                  x={xFor(i)}
                  y={H - 8}
                  fontSize="10"
                  textAnchor="middle"
                  fill="var(--text-3)"
                >
                  {monthLabel(p.month)}
                </text>
              )
            })}

            {/* garis hover vertikal */}
            {tip && (
              <line
                x1={tip.px}
                x2={tip.px}
                y1={padT}
                y2={padT + chartH}
                stroke="var(--text-3)"
                strokeWidth={1}
                strokeDasharray="2 2"
                pointerEvents="none"
              />
            )}
          </svg>
        )}

        {/* Tooltip HTML absolute */}
        {tip && (
          <div
            data-testid="invest-tooltip"
            style={{
              position: 'absolute',
              left: Math.min(Math.max(60, tip.px), Math.max(60, W - 60)),
              top: Math.max(10, tip.py - 12),
              transform: 'translate(-50%, -100%)',
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)',
              boxShadow: 'var(--shadow-sm)',
              padding: '8px 10px',
              fontSize: 12,
              pointerEvents: 'none',
              minWidth: 140,
              color: 'var(--text-1)',
              zIndex: 1,
            }}
          >
            <div style={{ fontWeight: 600, marginBottom: 4 }}>{tip.p.month}</div>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
              <span className="muted">Nilai</span>
              <span style={{ fontFamily: 'var(--font-mono)' }}>{idr(tip.p.value)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
              <span className="muted">Modal</span>
              <span style={{ fontFamily: 'var(--font-mono)' }}>{idr(tip.p.cost)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
              <span className="muted">U/R</span>
              <span
                style={{
                  fontFamily: 'var(--font-mono)',
                  color: tip.p.pl >= 0 ? 'var(--income)' : 'var(--expense)',
                  fontWeight: 600,
                }}
              >
                {tip.p.pl >= 0 ? '+' : ''}
                {idr(tip.p.pl)}
              </span>
            </div>
            {tip.p.quality === 'estimate' && (
              <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>
                Perkiraan harga
              </div>
            )}
          </div>
        )}
      </div>

      {/* Legenda + aksi tabel */}
      <div
        data-testid="invest-legend"
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginTop: 10,
          flexWrap: 'wrap',
          gap: 8,
        }}
      >
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 12 }}>
          <span
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--text-2)' }}
          >
            <span
              aria-hidden="true"
              style={{
                display: 'inline-block',
                width: 14,
                height: 2,
                background: 'var(--primary)',
                borderRadius: 1,
              }}
            />
            Nilai
          </span>
          <span
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--text-2)' }}
          >
            <span
              aria-hidden="true"
              style={{
                display: 'inline-block',
                width: 14,
                height: 0,
                borderTop: '2px dashed var(--text-3)',
              }}
            />
            Modal
          </span>
          {anyEstimate && (
            <span className="muted" style={{ fontSize: 11 }}>
              Titik berongga = perkiraan harga
            </span>
          )}
          {!live && (
            <span className="muted" style={{ fontSize: 11 }}>
              Harga tidak live
            </span>
          )}
        </div>
        <button
          type="button"
          className="btn-ghost"
          onClick={() => setShowTable((v) => !v)}
          style={{
            minHeight: 32,
            padding: '4px 12px',
            fontSize: 12,
            fontWeight: 500,
          }}
          aria-expanded={showTable}
          aria-controls="invest-table"
        >
          {showTable ? 'Sembunyikan tabel' : 'Lihat tabel'}
        </button>
      </div>

      {/* Tabel aksesibilitas */}
      {showTable && (
        <div
          id="invest-table"
          style={{ overflowX: 'auto', marginTop: 12 }}
        >
          <table
            role="table"
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              fontSize: 12,
              minWidth: 420,
            }}
          >
            <thead>
              <tr>
                {['Bulan', 'Nilai', 'Modal', 'U/R', 'MoM'].map((h, i) => (
                  <th
                    key={h}
                    className="muted"
                    style={{
                      textAlign: i === 0 ? 'left' : 'right',
                      paddingBottom: 6,
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
              {series.map((p) => (
                <tr key={p.month} style={{ borderTop: '1px solid var(--border)' }}>
                  <td style={{ padding: '6px 0' }}>{p.month}</td>
                  <td
                    style={{
                      padding: '6px 0 6px 12px',
                      textAlign: 'right',
                      fontFamily: 'var(--font-mono)',
                    }}
                  >
                    {formatShort(p.value)}
                  </td>
                  <td
                    style={{
                      padding: '6px 0 6px 12px',
                      textAlign: 'right',
                      fontFamily: 'var(--font-mono)',
                      color: 'var(--text-2)',
                    }}
                  >
                    {formatShort(p.cost)}
                  </td>
                  <td
                    style={{
                      padding: '6px 0 6px 12px',
                      textAlign: 'right',
                      fontFamily: 'var(--font-mono)',
                      color: p.pl >= 0 ? 'var(--income)' : 'var(--expense)',
                    }}
                  >
                    {p.pl >= 0 ? '+' : ''}
                    {formatShort(p.pl)}
                  </td>
                  <td
                    style={{
                      padding: '6px 0 6px 12px',
                      textAlign: 'right',
                      fontFamily: 'var(--font-mono)',
                    }}
                  >
                    {p.mom != null ? formatPercent(p.mom) : '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
