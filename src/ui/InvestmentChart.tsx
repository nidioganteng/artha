import { useEffect, useMemo, useRef, useState } from 'react'
import type { Trade, Asset, PriceSnapshot } from '../lib/types'
import { portfolioSeries, type SeriesPoint } from '../lib/calc'
import { formatShort } from '../lib/amount'
import { formatPercent, idr, todayISO } from '../lib/format'
import { shortMonthYear } from '../lib/period'
import { useContainerWidth } from '../lib/useContainerWidth'
import { Sheet } from './Sheet'

type ChartCustomRange = { from: string; to: string }
type Period = 1 | 3 | 6 | 12 | 'all' | 'custom'

const MK_NAMES = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des']
const MK_NAMES_FULL = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember']

function mkAdd(key: string, delta: number): string {
  const [y, m] = key.split('-').map(Number)
  const d = new Date(y, m - 1 + delta, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}
function todayMk(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function readPeriod(): Period {
  try {
    const v = localStorage.getItem('artha:chart:period')
    if (v === '1') return 1
    if (v === '3') return 3
    if (v === '6') return 6
    if (v === '12') return 12
    if (v === 'all') return 'all'
    if (v === 'custom') return 'custom'
  } catch { /* abaikan */ }
  return 1
}

function readCustomRange(): ChartCustomRange | null {
  try {
    const v = localStorage.getItem('artha:chart:custom')
    if (v) {
      const p = JSON.parse(v) as Record<string, unknown>
      if (typeof p.from === 'string' && typeof p.to === 'string') return { from: p.from as string, to: p.to as string }
    }
  } catch { /* abaikan */ }
  return null
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
        minHeight: 44,
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
  const [customRange, setCustomRange] = useState<ChartCustomRange | null>(() => readCustomRange())

  // State picker kustom
  const [pickerOpen, setPickerOpen] = useState(false)
  const [pickerFrom, setPickerFrom] = useState<string | null>(null)
  const [pickerTo, setPickerTo] = useState<string | null>(null)
  const [pickerYear, setPickerYear] = useState(() => new Date().getFullYear())

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
  useEffect(() => {
    if (customRange) {
      try { localStorage.setItem('artha:chart:custom', JSON.stringify(customRange)) } catch { /* abaikan */ }
    }
  }, [customRange])

  // Validasi filterAsset terhadap daftar aset — HANYA bila daftar sudah termuat
  useEffect(() => {
    if (filterAsset === 'all') return
    if (assets.length === 0) return  // masih memuat, jangan reset
    if (!assets.some((a) => a.id === filterAsset)) setFilterAsset('all')
  }, [assets, filterAsset])

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

  const chartRange = useMemo<number | 'all' | ChartCustomRange>(() => {
    if (period === 'custom') return customRange ?? 1
    return period
  }, [period, customRange])

  const series = useMemo<SeriesPoint[]>(() => {
    return portfolioSeries(
      trades,
      assets,
      priceHistory,
      priceBySymbol,
      filterAsset,
      chartRange,
      today,
    )
  }, [trades, assets, priceHistory, priceBySymbol, filterAsset, chartRange, today])

  // Reset hover saat data berubah
  useEffect(() => {
    setHoveredIdx((idx) => (idx != null && idx < series.length ? idx : null))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trades.length, filterAsset, chartRange])

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
  const padL = 56, padR = 8, padT = 10, padB = 28
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
            {last && last.quality === 'estimate' && (
              <div className="muted" style={{ fontSize: 11 }} title="Harga live tidak tersedia; nilai dihitung dari harga rata-rata beli">
                perkiraan
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── SELALU TAMPIL: Aset (baris 1) */}
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 8 }}>
        <span className="muted" style={{ fontSize: 12, whiteSpace: 'nowrap', flexShrink: 0 }}>
          Aset
        </span>
        <ChipBar>
          <Chip label="Semua" active={filterAsset === 'all'} onClick={() => setFilterAsset('all')} />
          {assets.map((a) => (
            <Chip key={a.id} label={a.symbol} active={filterAsset === a.id} onClick={() => setFilterAsset(a.id)} />
          ))}
        </ChipBar>
      </div>

      {/* ── SELALU TAMPIL: Periode (baris 2) */}
      <div style={{ marginBottom: 12 }}>
        <ChipBar>
          {([
            { v: 1 as Period, label: 'Bulan ini' },
            { v: 3 as Period, label: '3B' },
            { v: 6 as Period, label: '6B' },
            { v: 12 as Period, label: '12B' },
            { v: 'all' as Period, label: 'Maks' },
            {
              v: 'custom' as Period,
              label: period === 'custom' && customRange
                ? (customRange.from === customRange.to
                  ? shortMonthYear(customRange.from)
                  : `${shortMonthYear(customRange.from)}–${shortMonthYear(customRange.to)}`)
                : 'Kustom',
            },
          ]).map(({ v, label }) => (
            <Chip
              key={String(v)}
              label={label}
              active={period === v}
              onClick={() => {
                if (v === 'custom') {
                  if (customRange) {
                    setPickerFrom(customRange.from)
                    setPickerTo(customRange.to)
                    setPickerYear(parseInt(customRange.to.slice(0, 4)))
                  } else {
                    setPickerFrom(null)
                    setPickerTo(null)
                    setPickerYear(new Date().getFullYear())
                  }
                  setPickerOpen(true)
                } else {
                  setPeriod(v)
                }
              }}
            />
          ))}
        </ChipBar>
      </div>

      {/* ── Picker kustom */}
      <Sheet
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        title="Pilih Rentang Bulan"
        footer={
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn-ghost" onClick={() => setPickerOpen(false)} style={{ flex: 1, minHeight: 44 }}>
              Batal
            </button>
            <button
              className="btn"
              disabled={!pickerFrom}
              onClick={() => {
                if (!pickerFrom) return
                const end = pickerTo ?? pickerFrom
                const a = pickerFrom <= end ? pickerFrom : end
                const b = pickerFrom <= end ? end : pickerFrom
                setCustomRange({ from: a, to: b })
                setPeriod('custom')
                setPickerOpen(false)
              }}
              style={{ flex: 2, minHeight: 44 }}
            >
              Terapkan
            </button>
          </div>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Navigasi tahun */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <button
              className="btn-ghost"
              onClick={() => setPickerYear((y) => y - 1)}
              aria-label="Tahun sebelumnya"
              style={{ minHeight: 44, minWidth: 44, padding: '0 8px', border: 'none', borderRadius: 'var(--radius-sm)' }}
            >
              ‹
            </button>
            <span style={{ fontWeight: 600, fontSize: 15, color: 'var(--text-1)' }}>{pickerYear}</span>
            <button
              className="btn-ghost"
              onClick={() => setPickerYear((y) => y + 1)}
              disabled={pickerYear >= new Date().getFullYear()}
              aria-label="Tahun berikutnya"
              style={{ minHeight: 44, minWidth: 44, padding: '0 8px', border: 'none', borderRadius: 'var(--radius-sm)' }}
            >
              ›
            </button>
          </div>

          {/* Grid 4x3 bulan */}
          <div
            role="grid"
            aria-label={`Pilih bulan tahun ${pickerYear}`}
            style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 4 }}
          >
            {MK_NAMES.map((name, i) => {
              const mk = `${pickerYear}-${String(i + 1).padStart(2, '0')}`
              const todayKey = todayMk()
              const isFuture = mk > todayKey
              const isStart = pickerFrom === mk
              const isEnd = pickerTo === mk
              const rangeMin = pickerFrom && pickerTo ? (pickerFrom < pickerTo ? pickerFrom : pickerTo) : null
              const rangeMax = pickerFrom && pickerTo ? (pickerFrom > pickerTo ? pickerFrom : pickerTo) : null
              const inRange = !!(rangeMin && rangeMax && mk > rangeMin && mk < rangeMax)
              const isSelected = isStart || isEnd
              return (
                <button
                  key={mk}
                  role="gridcell"
                  aria-label={`${MK_NAMES_FULL[i]} ${pickerYear}`}
                  aria-pressed={isSelected}
                  aria-disabled={isFuture}
                  disabled={isFuture}
                  onClick={() => {
                    if (!pickerFrom || pickerTo) {
                      setPickerFrom(mk); setPickerTo(null)
                    } else {
                      setPickerTo(mk)
                    }
                  }}
                  style={{
                    minHeight: 44,
                    borderRadius: 'var(--radius-sm)',
                    border: 'none',
                    background: isSelected
                      ? 'var(--primary)'
                      : inRange
                        ? 'color-mix(in srgb, var(--primary) 15%, transparent)'
                        : 'transparent',
                    color: isSelected
                      ? 'var(--primary-fg)'
                      : isFuture
                        ? 'var(--text-3)'
                        : 'var(--text-1)',
                    fontSize: 13,
                    fontWeight: isSelected ? 600 : 400,
                    cursor: isFuture ? 'default' : 'pointer',
                    fontFamily: 'inherit',
                  }}
                >
                  {name}
                </button>
              )
            })}
          </div>

          {/* Teks ringkasan */}
          <div className="muted" style={{ fontSize: 13, minHeight: 20 }} aria-live="polite">
            {!pickerFrom
              ? 'Pilih bulan awal'
              : !pickerTo
                ? shortMonthYear(pickerFrom)
                : (() => {
                    const a = pickerFrom <= pickerTo ? pickerFrom : pickerTo
                    const b = pickerFrom <= pickerTo ? pickerTo : pickerFrom
                    return a === b ? shortMonthYear(a) : `${shortMonthYear(a)} sampai ${shortMonthYear(b)}`
                  })()}
          </div>
        </div>
      </Sheet>

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

              {/* Label Y — ditempatkan di kiri chart (x=2 s/d padL-4) */}
              {yTicks.map((v, i) => (
                <text
                  key={`ty-${i}`}
                  x={2}
                  y={yFor(v) - 3}
                  fontSize="11"
                  textAnchor="start"
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
                    fontSize="11"
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
