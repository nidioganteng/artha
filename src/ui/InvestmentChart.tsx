import { useEffect, useMemo, useRef, useState } from 'react'
import type { Trade, Asset, PriceSnapshot } from '../lib/types'
import { portfolioSeries, type SeriesPoint } from '../lib/calc'
import { formatShort } from '../lib/amount'
import { formatPercent, idr, todayISO } from '../lib/format'
import { useContainerWidth } from '../lib/useContainerWidth'

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

// ── Chip bar — scrollable horizontal tanpa trigger scroll halaman
function ChipBar({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        display: 'flex',
        gap: 6,
        overflowX: 'auto',
        overscrollBehaviorX: 'contain',
        WebkitOverflowScrolling: 'touch' as React.CSSProperties['WebkitOverflowScrolling'],
        scrollbarWidth: 'none' as React.CSSProperties['scrollbarWidth'],
        paddingBottom: 2,
      }}
    >
      {children}
    </div>
  )
}

// ── Chip tunggal
function Chip({
  label,
  active,
  onClick,
}: {
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        flexShrink: 0,
        padding: '5px 12px',
        borderRadius: 9999,
        border: `1px solid ${active ? 'var(--primary)' : 'var(--border)'}`,
        background: active ? 'var(--primary)' : 'transparent',
        color: active ? 'var(--primary-fg)' : 'var(--text-2)',
        fontSize: 13,
        fontWeight: active ? 600 : 400,
        cursor: 'pointer',
        minHeight: 34,
        fontFamily: 'inherit',
        whiteSpace: 'nowrap' as const,
        transition: 'background 120ms ease-out, color 120ms ease-out',
      }}
    >
      {label}
    </button>
  )
}

// ── Area grafik kosong dengan tinggi tetap dan salib sumbu samar
function EmptyChartArea({
  height,
  children,
}: {
  height: number
  children: React.ReactNode
}) {
  const [W, elRef] = useContainerWidth()
  return (
    <div ref={elRef} style={{ position: 'relative', width: '100%', height }}>
      {W > 0 && (
        <svg
          width={W}
          height={height}
          viewBox={`0 0 ${W} ${height}`}
          aria-hidden="true"
          style={{ display: 'block', position: 'absolute', inset: 0 }}
        >
          {/* Grid samar */}
          {[0.25, 0.5, 0.75].map((t) => (
            <line
              key={t}
              x1={8}
              x2={W - 8}
              y1={height * t}
              y2={height * t}
              stroke="var(--border)"
              strokeWidth={1}
              strokeDasharray="2 4"
              opacity={0.5}
            />
          ))}
          {/* Garis bawah */}
          <line
            x1={8}
            x2={W - 8}
            y1={height - 28}
            y2={height - 28}
            stroke="var(--border)"
            strokeWidth={1}
          />
        </svg>
      )}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 10,
          padding: '16px 24px',
          textAlign: 'center',
        }}
      >
        {children}
      </div>
    </div>
  )
}

export function InvestmentChart({
  trades,
  assets,
  priceHistory,
  currentPrices,
  live,
  onOpenDCA,
}: {
  trades: Trade[]
  assets: Asset[]
  priceHistory: PriceSnapshot[]
  currentPrices: Record<string, number>
  live: boolean
  onOpenDCA?: (assetId?: string) => void
}) {
  const today = todayISO()
  const H = 240

  const [filterAsset, setFilterAsset] = useState<string>(() => readAsset())
  const [period, setPeriod] = useState<Period>(() => readPeriod())
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null)
  const [showTable, setShowTable] = useState(false)
  const [chartError, setChartError] = useState<string | null>(null)

  // Callback ref: aman untuk elemen yang dirender secara kondisional.
  // useRef + useEffect([ref]) tidak berfungsi bila elemen belum ada saat mount.
  const [W, chartElRef] = useContainerWidth()
  const svgRef = useRef<SVGSVGElement>(null)

  // Simpan preferensi ke localStorage
  useEffect(() => {
    try { localStorage.setItem('artha:chart:asset', filterAsset) } catch { /* abaikan */ }
  }, [filterAsset])
  useEffect(() => {
    try { localStorage.setItem('artha:chart:period', String(period)) } catch { /* abaikan */ }
  }, [period])

  // Validasi filterAsset terhadap daftar aset — HANYA bila daftar sudah termuat
  useEffect(() => {
    if (filterAsset === 'all') return
    if (assets.length === 0) return  // masih memuat, jangan reset
    if (!assets.some((a) => a.id === filterAsset)) setFilterAsset('all')
  }, [assets, filterAsset])

  // Reset hover saat data berubah
  useEffect(() => {
    setHoveredIdx((idx) => (idx != null && idx < series.length ? idx : null))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trades.length, filterAsset, period])

  const priceBySymbol = useMemo<Record<string, number>>(() => {
    const out: Record<string, number> = {}
    for (const a of assets) {
      const ref = a.price_ref
      if (ref) {
        const p = (currentPrices as Record<string, number>)[ref]
        if (p != null && Number.isFinite(p) && p > 0) out[a.symbol] = p
      }
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

  // ── Info aset terpilih (untuk pesan kosong)
  const selectedAsset = filterAsset !== 'all'
    ? assets.find((a) => a.id === filterAsset)
    : null

  // ── Ringkasan
  const last = series.length > 0 ? series[series.length - 1] : null
  const secondLast = series.length >= 2 ? series[series.length - 2] : null
  const momValue = secondLast && secondLast.value > 0
    ? (last!.value - secondLast.value) / secondLast.value
    : null
  const momAbs = secondLast && secondLast.value > 0
    ? last!.value - secondLast.value
    : null
  const anyEstimate = series.some((p) => p.quality === 'estimate')

  // ── Geometri SVG
  const padL = 8, padR = 8, padT = 10, padB = 28
  const chartW = Math.max(50, W - padL - padR)
  const chartH = H - padT - padB

  // Sumbu Y: bila semua nilai sama (garis datar), beri padding ±10% agar tidak degenerate
  const rawMax = series.length > 0
    ? Math.max(...series.map((p) => Math.max(p.value, p.cost)))
    : 0
  const rawMin = series.length > 0
    ? Math.min(...series.map((p) => Math.min(p.value, p.cost)))
    : 0
  const range = rawMax - rawMin
  const maxVal = rawMax > 0
    ? (range < rawMax * 0.01 ? rawMax * 1.15 : rawMax * 1.08)
    : 1

  const xFor = (i: number) =>
    series.length <= 1 ? padL + chartW / 2 : padL + (i / (series.length - 1)) * chartW
  const yFor = (v: number) => {
    const y = padT + chartH - (v / maxVal) * chartH
    return Number.isFinite(y) ? y : padT + chartH / 2
  }
  const monthLbl = (mk: string) => {
    const mm = Number(mk.slice(5))
    return ['', 'Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'][mm] || mk
  }
  const xLabelStep = Math.max(1, Math.ceil(series.length / 6))

  // Path dengan pengaman NaN — bila gagal, catat error dan gunakan path kosong
  let valuePath = '', costPath = '', areaPath = ''
  try {
    valuePath = series.map((p, i) => {
      const x = xFor(i), y = yFor(p.value)
      if (!Number.isFinite(x) || !Number.isFinite(y)) throw new Error(`NaN di titik ${i}: x=${x} y=${y}`)
      return `${i === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`
    }).join(' ')
    costPath = series.map((p, i) => {
      const x = xFor(i), y = yFor(p.cost)
      if (!Number.isFinite(x) || !Number.isFinite(y)) throw new Error(`NaN di titik ${i}: x=${x} y=${y}`)
      return `${i === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`
    }).join(' ')
    if (series.length >= 2) {
      const up = series.map((p, i) =>
        `${i === 0 ? 'M' : 'L'} ${xFor(i).toFixed(2)} ${yFor(p.value).toFixed(2)}`
      )
      const down = [...series].reverse().map((p, i) =>
        `L ${xFor(series.length - 1 - i).toFixed(2)} ${yFor(p.cost).toFixed(2)}`
      )
      areaPath = [...up, ...down, 'Z'].join(' ')
    }
    if (chartError) setChartError(null)
  } catch (e) {
    console.error('[InvestmentChart] Gagal menghitung path grafik:', e)
    if (!chartError) setChartError('Grafik tidak dapat ditampilkan.')
  }

  const yTicks = [0, 0.33, 0.66, 1].map((t) => maxVal * t)

  const tipIdx = hoveredIdx
  const tip = tipIdx != null && series[tipIdx]
    ? { px: xFor(tipIdx), py: yFor(series[tipIdx].value), p: series[tipIdx] }
    : null

  function onSvgKey(e: React.KeyboardEvent<SVGSVGElement>) {
    if (series.length === 0) return
    if (e.key === 'ArrowLeft') {
      e.preventDefault()
      setHoveredIdx((idx) => Math.max(0, (idx ?? series.length - 1) - 1))
    } else if (e.key === 'ArrowRight') {
      e.preventDefault()
      setHoveredIdx((idx) => Math.min(series.length - 1, (idx ?? 0) + 1))
    } else if (e.key === 'Home') {
      e.preventDefault(); setHoveredIdx(0)
    } else if (e.key === 'End') {
      e.preventDefault(); setHoveredIdx(series.length - 1)
    } else if (e.key === 'Escape') {
      setHoveredIdx(null)
    }
  }

  function pointerToIdx(clientX: number): number {
    if (!svgRef.current || series.length === 0) return 0
    const rect = svgRef.current.getBoundingClientRect()
    const t = ((clientX - rect.left) - padL) / Math.max(1, chartW)
    return Math.max(0, Math.min(series.length - 1, Math.round(t * (series.length - 1))))
  }

  // ── Penentu konten area grafik
  const noTradesAtAll = trades.length === 0
  const noTradesForFilter = !noTradesAtAll && series.length === 0 && filterAsset !== 'all'
  const singlePoint = !noTradesAtAll && series.length === 1
  const hasChart = series.length >= 2

  return (
    <div className="card bento-full" data-testid="investment-chart">

      {/* ── SELALU TAMPIL: Judul + ringkasan */}
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 12,
          flexWrap: 'wrap',
          marginBottom: 10,
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
          {/* Ringkasan nilai: "-" bila belum ada data */}
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'baseline' }}>
            <div
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 20,
                fontWeight: 700,
                color: 'var(--text-1)',
              }}
              aria-label={last ? `Nilai saat ini ${idr(last.value)}` : 'Nilai belum tersedia'}
            >
              {last ? formatShort(last.value) : '-'}
            </div>
            {momValue != null && momAbs != null && (
              <div
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 13,
                  fontWeight: 600,
                  color: momValue >= 0 ? 'var(--income)' : 'var(--expense)',
                }}
              >
                {momValue >= 0 ? 'Naik' : 'Turun'} {formatPercent(Math.abs(momValue))}
                {' '}({momAbs >= 0 ? '+' : ''}{formatShort(momAbs)}) dari bulan lalu
              </div>
            )}
            {last && momValue === null && series.length >= 2 && (
              <span className="muted" style={{ fontSize: 12 }}>Belum ada pembanding bulan lalu</span>
            )}
            {last && (
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
                  {last.pl >= 0 ? '+' : ''}{formatShort(last.pl)}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── SELALU TAMPIL: Chip aset + chip periode */}
      <div
        style={{
          display: 'flex',
          gap: 12,
          flexWrap: 'wrap',
          marginBottom: 12,
          alignItems: 'flex-start',
        }}
      >
        {/* Chip aset — scrollable horizontal */}
        <ChipBar>
          <Chip
            label="Semua"
            active={filterAsset === 'all'}
            onClick={() => setFilterAsset('all')}
          />
          {assets.map((a) => (
            <Chip
              key={a.id}
              label={a.symbol}
              active={filterAsset === a.id}
              onClick={() => setFilterAsset(a.id)}
            />
          ))}
        </ChipBar>

        {/* Chip periode */}
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
            flexShrink: 0,
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
                  minHeight: 30,
                  padding: '3px 10px',
                  fontSize: 12,
                  fontWeight: 600,
                  fontFamily: 'inherit',
                  background: active ? 'var(--surface)' : 'transparent',
                  color: active ? 'var(--text-1)' : 'var(--text-2)',
                  border: active ? '1px solid var(--border)' : '1px solid transparent',
                  borderRadius: 'calc(var(--radius-sm) - 2px)',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap' as const,
                }}
              >
                {p === 'all' ? 'Semua' : `${p}B`}
              </button>
            )
          })}
        </div>
      </div>

      {/* ── Area grafik — tinggi tetap, konten bervariasi */}
      {noTradesAtAll && (
        <EmptyChartArea height={H}>
          <p className="muted" style={{ fontSize: 13, margin: 0 }}>
            Belum ada catatan investasi.
          </p>
          {onOpenDCA && (
            <button
              className="btn"
              onClick={() => onOpenDCA()}
              style={{ marginTop: 4 }}
            >
              Catat DCA pertama
            </button>
          )}
        </EmptyChartArea>
      )}

      {noTradesForFilter && selectedAsset && (
        <EmptyChartArea height={H}>
          <p className="muted" style={{ fontSize: 13, margin: 0 }}>
            Belum ada catatan DCA untuk {selectedAsset.name}.
          </p>
          {onOpenDCA && (
            <button
              className="btn"
              onClick={() => onOpenDCA(selectedAsset.id)}
              style={{ marginTop: 4 }}
            >
              Catat DCA {selectedAsset.symbol}
            </button>
          )}
        </EmptyChartArea>
      )}

      {/* Kosong karena filter 'all' tapi ada trades tapi series kosong (edge case) */}
      {!noTradesAtAll && series.length === 0 && filterAsset === 'all' && (
        <EmptyChartArea height={H}>
          <p className="muted" style={{ fontSize: 13, margin: 0 }}>
            Belum ada data cukup untuk rentang yang dipilih.
          </p>
        </EmptyChartArea>
      )}

      {singlePoint && (
        <EmptyChartArea height={H}>
          <div
            aria-hidden="true"
            style={{
              width: 10,
              height: 10,
              borderRadius: '50%',
              background: 'var(--primary)',
              margin: '0 auto 6px',
              flexShrink: 0,
            }}
          />
          {last && (
            <div
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 14,
                fontWeight: 600,
                color: 'var(--text-1)',
              }}
            >
              {formatShort(last.value)}
            </div>
          )}
          <p className="muted" style={{ fontSize: 12, margin: 0 }}>
            Grafik akan terisi seiring bulan berjalan.
          </p>
        </EmptyChartArea>
      )}

      {hasChart && (
        // chartElRef: callback ref — aman untuk elemen yang dirender secara kondisional.
        // Tinggi tetap H agar wadah tidak pernah runtuh jadi 0.
        <div ref={chartElRef} style={{ position: 'relative', width: '100%', height: H }}>
          {/* Pesan galat kalkulasi */}
          {chartError && (
            <div
              style={{
                position: 'absolute', inset: 0, display: 'flex',
                alignItems: 'center', justifyContent: 'center',
              }}
            >
              <p className="muted" style={{ fontSize: 12 }}>{chartError}</p>
            </div>
          )}
          {/* Skeleton saat lebar belum terukur (biasanya hanya satu frame) */}
          {W === 0 && !chartError && (
            <div
              style={{
                position: 'absolute', inset: 0,
                background: 'var(--surface-2)',
                borderRadius: 'var(--radius-sm)',
                opacity: 0.5,
              }}
              aria-hidden="true"
            />
          )}
          {W > 0 && !chartError && (
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
              style={{ display: 'block', outline: 'none', touchAction: 'pan-y', position: 'absolute', inset: 0 }}
            >
              {/* Grid Y */}
              {yTicks.map((v, i) => (
                <line
                  key={`gy-${i}`}
                  x1={padL} x2={padL + chartW}
                  y1={yFor(v)} y2={yFor(v)}
                  stroke="var(--border)"
                  strokeWidth={1}
                  strokeDasharray={i === 0 ? '0' : '2 3'}
                />
              ))}

              {/* Label Y */}
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

              {/* Area antara Nilai dan Modal */}
              {areaPath && (
                <path
                  d={areaPath}
                  fill={last && last.pl >= 0 ? 'var(--income)' : 'var(--expense)'}
                  fillOpacity={0.08}
                  stroke="none"
                />
              )}

              {/* Garis modal (dashed) */}
              <path
                d={costPath}
                fill="none"
                stroke="var(--text-3)"
                strokeWidth={1.5}
                strokeDasharray="4 3"
              />

              {/* Garis nilai */}
              <path
                d={valuePath}
                fill="none"
                stroke="var(--primary)"
                strokeWidth={2}
              />

              {/* Titik nilai */}
              {series.map((p, i) => {
                const cx = xFor(i)
                const cy = yFor(p.value)
                const isMarket = p.quality === 'market'
                return (
                  <circle
                    key={`pt-${i}`}
                    cx={cx} cy={cy}
                    r={i === hoveredIdx ? 5 : 3.5}
                    fill={isMarket ? 'var(--primary)' : 'var(--surface)'}
                    stroke="var(--primary)"
                    strokeWidth={1.5}
                  />
                )
              })}

              {/* Label X */}
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
                    {monthLbl(p.month)}
                  </text>
                )
              })}

              {/* Garis hover vertikal */}
              {tip && (
                <line
                  x1={tip.px} x2={tip.px}
                  y1={padT} y2={padT + chartH}
                  stroke="var(--text-3)"
                  strokeWidth={1}
                  strokeDasharray="2 2"
                  pointerEvents="none"
                />
              )}
            </svg>
          )}

          {/* Tooltip HTML */}
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
                  {tip.p.pl >= 0 ? '+' : ''}{idr(tip.p.pl)}
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
      )}

      {/* ── SELALU TAMPIL (bila ada data): Legenda + tombol tabel */}
      {(hasChart || singlePoint) && (
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
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--text-2)' }}>
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
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--text-2)' }}>
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
                Nilai bulan ini memakai harga tersimpan terakhir
              </span>
            )}
          </div>
          {hasChart && (
            <button
              type="button"
              className="btn-ghost"
              onClick={() => setShowTable((v) => !v)}
              style={{ minHeight: 32, padding: '4px 12px', fontSize: 12, fontWeight: 500 }}
              aria-expanded={showTable}
              aria-controls="invest-table"
            >
              {showTable ? 'Sembunyikan tabel' : 'Tampilkan tabel'}
            </button>
          )}
        </div>
      )}

      {/* Tabel aksesibilitas */}
      {showTable && hasChart && (
        <div id="invest-table" style={{ overflowX: 'auto', marginTop: 12 }}>
          <table
            role="table"
            style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, minWidth: 420 }}
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
                  <td style={{ padding: '6px 0 6px 12px', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                    {formatShort(p.value)}
                  </td>
                  <td style={{ padding: '6px 0 6px 12px', textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--text-2)' }}>
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
                    {p.pl >= 0 ? '+' : ''}{formatShort(p.pl)}
                  </td>
                  <td style={{ padding: '6px 0 6px 12px', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
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
