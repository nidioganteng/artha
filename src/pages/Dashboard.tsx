import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { m, useReducedMotion } from 'motion/react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useStore } from '../lib/store'
import { usePortfolio } from '../lib/usePortfolio'
import { formatPercent, idr, monthKey, monthLabel, shiftMonth, todayISO, dateLabel } from '../lib/format'
import { formatShort } from '../lib/amount'
import { accountBalance, monthReport, unassignedTrades } from '../lib/ledger'
import { AlertTriangle } from 'lucide-react'
import { useContainerWidth } from '../lib/useContainerWidth'

// ──────────────────────────────────────────────────────
// Hook: count-up
// ──────────────────────────────────────────────────────
function useCountUp(target: number, duration = 650) {
  const reduced = useMemo(
    () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    [],
  )
  const [val, setVal] = useState(reduced ? target : 0)
  const raf = useRef(0)
  const prev = useRef(reduced ? target : 0)

  useEffect(() => {
    if (reduced) { setVal(target); return }
    const from = prev.current
    const to = target
    if (from === to) return
    const t0 = performance.now()
    const tick = (now: number) => {
      const p = Math.min((now - t0) / duration, 1)
      const ease = 1 - (1 - p) ** 3
      setVal(from + (to - from) * ease)
      if (p < 1) raf.current = requestAnimationFrame(tick)
      else prev.current = to
    }
    raf.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf.current)
  }, [target, duration, reduced])

  return val
}

// ──────────────────────────────────────────────────────
// SVG helpers
// ──────────────────────────────────────────────────────
function polar(cx: number, cy: number, r: number, deg: number) {
  const rad = ((deg - 90) * Math.PI) / 180
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) }
}

function arcPath(cx: number, cy: number, r: number, a0: number, a1: number) {
  if (Math.abs(a1 - a0) >= 359.9) {
    const t = polar(cx, cy, r, 0)
    const b = polar(cx, cy, r, 180)
    return `M ${t.x} ${t.y} A ${r} ${r} 0 1 1 ${b.x} ${b.y} A ${r} ${r} 0 1 1 ${t.x} ${t.y}`
  }
  const s = polar(cx, cy, r, a0)
  const e = polar(cx, cy, r, a1)
  return `M ${s.x} ${s.y} A ${r} ${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${e.x} ${e.y}`
}

const CAT_TOKENS = [
  'var(--expense)',
  'var(--warn)',
  'var(--invest)',
  'var(--income)',
  'var(--accent)',
  'var(--primary)',
]

// ──────────────────────────────────────────────────────
// KPI Card
// ──────────────────────────────────────────────────────
function KpiCard({
  label,
  value,
  token,
  sub,
  index,
  testId,
}: {
  label: string
  value: number
  token: string
  sub?: string
  index: number
  testId?: string
}) {
  const animated = useCountUp(value)
  const reduced = useReducedMotion()
  return (
    <m.div
      className="card bento-kpi"
      style={{ padding: 20 }}
      data-testid={testId}
      initial={{ opacity: 0, y: reduced ? 0 : 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: reduced ? 0 : 0.3, delay: reduced ? 0 : index * 0.06, ease: 'easeOut' }}
    >
      <div className="muted" style={{ fontSize: 12 }}>{label}</div>
      <div className="num-lg" style={{ color: token, marginTop: 4 }} aria-label={idr(value)}>
        {formatShort(animated)}
      </div>
      {sub && <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>{sub}</div>}
    </m.div>
  )
}

// ──────────────────────────────────────────────────────
// Donut Chart
// ──────────────────────────────────────────────────────
function DonutChart({ cats }: { cats: [string, number][] }) {
  const total = cats.reduce((s, [, v]) => s + v, 0)
  const cx = 80, cy = 80, r = 52, sw = 22
  let a = 0
  const slices = cats.slice(0, 6).map(([name, v], i) => {
    const end = a + (v / total) * 360
    const d = arcPath(cx, cy, r, a, end)
    a = end
    return { name, v, d, color: CAT_TOKENS[i % CAT_TOKENS.length] }
  })

  // Font size adaptif: muat dalam lingkaran dalam (radius ~41 unit SVG), minimum 11px
  const centerText = formatShort(total)
  const centerFs = centerText.length <= 8 ? 13 : 11

  return (
    <svg
      viewBox="0 0 160 160"
      style={{ width: 140, height: 140, flexShrink: 0, display: 'block' }}
      aria-hidden="true"
    >
      {slices.map((s) => (
        <path key={s.name} d={s.d} fill="none" stroke={s.color} strokeWidth={sw} strokeLinecap="butt" />
      ))}
      <text x={cx} y={cy - 6} textAnchor="middle" style={{ fontSize: '11px', fill: 'var(--text-3)' }}>
        Total
      </text>
      <text
        x={cx}
        y={cy + 9}
        textAnchor="middle"
        style={{ fontSize: `${centerFs}px`, fontWeight: '600', fill: 'var(--text-1)', fontFamily: 'var(--font-mono)' }}
      >
        {centerText}
      </text>
    </svg>
  )
}

// ──────────────────────────────────────────────────────
// Bar Chart — income vs expense, 6 months (full-width)
// ──────────────────────────────────────────────────────
function BarChart({ data }: { data: { month: string; income: number; expense: number }[] }) {
  const [tip, setTip] = useState<{ px: number; py: number; text: string } | null>(null)
  const divRef = useRef<HTMLDivElement | null>(null)
  const [W, widthRef] = useContainerWidth()
  const wrapRef = useCallback((el: HTMLDivElement | null) => {
    divRef.current = el
    widthRef(el)
  }, [widthRef])
  const H = 220, padB = 32, padT = 8, barGap = 6
  const maxV = Math.max(...data.flatMap((d) => [d.income, d.expense]), 1)
  const slot = W > 0 ? W / data.length : 0
  const barW = Math.min(28, slot * 0.28)
  const rx = Math.min(4, barW / 2)
  const groupW = barW * 2 + barGap
  const maxDataH = H - padB - padT

  return (
    <div ref={wrapRef} style={{ position: 'relative', width: '100%' }}>
      {/* HTML legend — never distorted */}
      <div
        data-testid="chart-legend"
        style={{ display: 'flex', gap: 16, marginBottom: 8, fontSize: 12, color: 'var(--text-3)', alignItems: 'center' }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ width: 10, height: 10, borderRadius: 2, background: 'var(--income)', display: 'inline-block', flexShrink: 0 }} />
          Pemasukan
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ width: 10, height: 10, borderRadius: 2, background: 'var(--expense)', display: 'inline-block', flexShrink: 0 }} />
          Pengeluaran
        </span>
      </div>

      {W > 0 && (
        <svg
          viewBox={`0 0 ${W} ${H}`}
          width={W}
          height={H}
          style={{ display: 'block', width: '100%' }}
          role="img"
          aria-label="Grafik pemasukan dan pengeluaran 6 bulan terakhir"
          onPointerLeave={() => setTip(null)}
        >
          <title>Pemasukan vs pengeluaran</title>

          {/* Zero baseline */}
          <line x1={0} y1={H - padB} x2={W} y2={H - padB} stroke="var(--border)" strokeWidth={1} />

          {data.map((d, i) => {
            const x0 = slot * i + (slot - groupW) / 2
            const incH = Math.max(2, (d.income / maxV) * maxDataH)
            const expH = Math.max(2, (d.expense / maxV) * maxDataH)
            const lbl = new Intl.DateTimeFormat('id-ID', { month: 'short' })
              .format(new Date(parseInt(d.month.slice(0, 4)), parseInt(d.month.slice(5)) - 1, 1))
              .slice(0, 3)
            return (
              <g key={d.month}>
                <rect
                  x={x0} y={H - padB - incH} width={barW} height={incH} rx={rx}
                  style={{ fill: 'var(--income)', cursor: 'default' }} opacity={0.9}
                  onPointerEnter={(e) => {
                    const rect = divRef.current?.getBoundingClientRect()
                    if (rect) setTip({ px: e.clientX - rect.left, py: e.clientY - rect.top, text: idr(d.income) })
                  }}
                >
                  <title>Pemasukan: {idr(d.income)}</title>
                </rect>
                <rect
                  x={x0 + barW + barGap} y={H - padB - expH} width={barW} height={expH} rx={rx}
                  style={{ fill: 'var(--expense)', cursor: 'default' }} opacity={0.9}
                  onPointerEnter={(e) => {
                    const rect = divRef.current?.getBoundingClientRect()
                    if (rect) setTip({ px: e.clientX - rect.left, py: e.clientY - rect.top, text: idr(d.expense) })
                  }}
                >
                  <title>Pengeluaran: {idr(d.expense)}</title>
                </rect>
                <text
                  x={x0 + groupW / 2} y={H - 10}
                  textAnchor="middle"
                  style={{ fontSize: '11px', fill: 'var(--text-3)' }}
                >
                  {lbl}
                </text>
              </g>
            )
          })}
        </svg>
      )}

      {/* HTML tooltip — sharp at every pixel density */}
      {tip && (
        <div
          role="tooltip"
          style={{
            position: 'absolute',
            left: tip.px,
            top: tip.py - 32,
            transform: 'translateX(-50%)',
            background: 'var(--surface-2)',
            border: '1px solid var(--border)',
            borderRadius: 4,
            padding: '2px 8px',
            fontSize: 11,
            fontFamily: 'var(--font-mono)',
            color: 'var(--text-1)',
            whiteSpace: 'nowrap',
            pointerEvents: 'none',
            zIndex: 1,
          }}
        >
          {tip.text}
        </div>
      )}
    </div>
  )
}

// ──────────────────────────────────────────────────────
// Portfolio Stack (3D cards per platform)
// ──────────────────────────────────────────────────────
interface PlatformCard {
  id: string
  name: string
  cost: number
  value: number
  pl: number
  symbols: string[]
}

function PortfolioStack({
  cards,
  totalValue,
  totalBought,
  totalPL,
  roi,
  live,
  at,
  goto,
  'data-testid': testId,
}: {
  cards: PlatformCard[]
  totalValue: number
  totalBought: number
  totalPL: number
  roi: number | null | undefined
  live: boolean
  at: string | null
  goto: (tab: string) => void
  'data-testid'?: string
}) {
  const [activeIdx, setActiveIdx] = useState(0)
  const frontRef = useRef<HTMLDivElement>(null)
  const touchX = useRef(0)
  const reduced =
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

  useEffect(() => {
    const el = frontRef.current
    if (!el || reduced) return
    const onMove = (e: PointerEvent) => {
      if (e.pointerType === 'touch') return
      const rect = el.getBoundingClientRect()
      const cx = (e.clientX - rect.left) / rect.width - 0.5
      const cy = (e.clientY - rect.top) / rect.height - 0.5
      el.style.transform = `rotateY(${cx * 12}deg) rotateX(${cy * -8}deg) scale(1.01)`
    }
    const onLeave = () => { el.style.transform = '' }
    el.addEventListener('pointermove', onMove)
    el.addEventListener('pointerleave', onLeave)
    return () => {
      el.removeEventListener('pointermove', onMove)
      el.removeEventListener('pointerleave', onLeave)
    }
  }, [reduced])

  const shown = useMemo(() => {
    if (!cards.length) return []
    const arr = [...cards]
    if (activeIdx > 0 && activeIdx < arr.length) {
      const [c] = arr.splice(activeIdx, 1)
      arr.unshift(c)
    }
    return arr.slice(0, 3)
  }, [cards, activeIdx])

  if (!cards.length) {
    return (
      <div
        className="card-hero bento-hero"
        data-testid={testId}
        style={{
          padding: 32,
          minHeight: 200,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'flex-start',
        }}
      >
        <div style={{ fontSize: 13, opacity: 0.7, marginBottom: 8 }}>Portofolio Investasi</div>
        <div style={{ fontWeight: 700, fontSize: 20, marginBottom: 8 }}>
          Belum ada data investasi
        </div>
        <p style={{ fontSize: 14, opacity: 0.75, maxWidth: 280, lineHeight: 1.5, marginBottom: 16 }}>
          Tambahkan aset di Pengaturan, lalu catat DCA pertamamu.
        </p>
        <button
          className="btn"
          onClick={() => goto('inv')}
          style={{
            background: 'rgba(255,255,255,0.2)',
            color: 'var(--primary-fg)',
            border: '1px solid rgba(255,255,255,0.3)',
          }}
        >
          Catat DCA
        </button>
      </div>
    )
  }

  const backCards = shown.slice(1)

  return (
    <div
      className="bento-hero"
      data-testid={testId}
      style={{ perspective: '900px', position: 'relative', paddingBottom: backCards.length > 0 ? 28 : 0 }}
      onTouchStart={(e) => { touchX.current = e.touches[0].clientX }}
      onTouchEnd={(e) => {
        const dx = e.changedTouches[0].clientX - touchX.current
        if (Math.abs(dx) > 48) {
          setActiveIdx((i) => dx < 0 ? Math.min(i + 1, cards.length - 1) : Math.max(i - 1, 0))
        }
      }}
    >
      {/* Back cards */}
      {backCards.map((card, idx) => {
        const depth = idx + 1
        return (
          <div
            key={card.id}
            className="card-hero"
            style={{
              position: 'absolute',
              inset: 0,
              zIndex: 3 - depth,
              transform: `translateY(${depth * 12}px) scale(${1 - depth * 0.03})`,
              transformOrigin: 'top center',
              transition: reduced ? 'none' : 'transform 300ms ease-out',
              padding: 24,
            }}
          >
            <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 4 }}>{card.name}</div>
            <div
              style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, fontSize: 18 }}
            >
              {formatShort(card.value)}
            </div>
          </div>
        )
      })}

      {/* Front card */}
      <div
        ref={frontRef}
        className="card-hero"
        style={{
          position: 'relative',
          zIndex: 4,
          padding: 28,
          transition: reduced ? 'none' : 'transform 150ms ease-out',
        }}
      >
        {/* Decorative blobs */}
        <div
          aria-hidden="true"
          style={{
            position: 'absolute', top: -48, right: -48,
            width: 220, height: 220, borderRadius: '50%',
            background: 'rgba(255,255,255,0.06)', pointerEvents: 'none',
          }}
        />
        <div
          aria-hidden="true"
          style={{
            position: 'absolute', bottom: -60, left: -24,
            width: 180, height: 180, borderRadius: '50%',
            background: 'rgba(255,255,255,0.04)', pointerEvents: 'none',
          }}
        />

        <div style={{ position: 'relative', zIndex: 1 }}>
          {/* Header */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
              marginBottom: 10,
            }}
          >
            <div>
              <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 2 }}>Portofolio Investasi</div>
              <div style={{ fontSize: 15, fontWeight: 600 }}>{shown[0]?.name}</div>
            </div>
            {cards.length > 1 && (
              <div style={{ display: 'flex', gap: 4, alignItems: 'center', paddingTop: 2, flexWrap: 'wrap' }}>
                {cards.map((c, i) => (
                  <button
                    key={c.id}
                    onClick={() => setActiveIdx(i)}
                    aria-label={`Platform ${c.name}`}
                    aria-pressed={i === activeIdx}
                    style={{
                      minHeight: 32,
                      padding: '4px 10px',
                      borderRadius: 'var(--radius-xl)',
                      border: 'none',
                      cursor: 'pointer',
                      fontSize: 11,
                      fontWeight: i === activeIdx ? 700 : 400,
                      background: i === activeIdx ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.1)',
                      color: 'var(--primary-fg)',
                      transition: reduced ? 'none' : 'background 150ms ease-out, font-weight 150ms ease-out',
                      fontFamily: 'inherit',
                    }}
                  >
                    {c.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="num-hero" style={{ marginBottom: 16 }}>
            {formatShort(totalValue)}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 16px' }}>
            <div>
              <div style={{ fontSize: 11, opacity: 0.7 }}>Modal</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, fontSize: 14 }}>
                {formatShort(totalBought)}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 11, opacity: 0.7 }}>Untung / Rugi</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, fontSize: 14 }}>
                {totalPL >= 0 ? '+' : ''}{formatShort(totalPL)}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 11, opacity: 0.7 }}>ROI</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, fontSize: 14 }}>
                {formatPercent(roi)}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 11, opacity: 0.7 }}>Harga</div>
              <div style={{ fontSize: 12, opacity: 0.85 }}>
                {live ? 'Live' : 'Tersimpan'}
                {at
                  ? ` · ${new Date(at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}`
                  : ''}
              </div>
            </div>
          </div>

          {shown[0]?.symbols.length > 0 && (
            <div style={{ marginTop: 12, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {shown[0].symbols.map((sym) => (
                <span
                  key={sym}
                  style={{
                    fontSize: 11,
                    padding: '2px 8px',
                    borderRadius: 9999,
                    background: 'rgba(255,255,255,0.18)',
                    fontFamily: 'var(--font-mono)',
                  }}
                >
                  {sym}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ──────────────────────────────────────────────────────
// Investment Summary (companion card, bento-summary)
// ──────────────────────────────────────────────────────
function InvestmentSummary({
  total,
  goto,
  className,
}: {
  total: { value: number; totalBought: number; totalPL: number; roi: number | null | undefined; cagr: number | null | undefined }
  goto: (tab: string) => void
  className?: string
}) {
  const plPositive = total.totalPL >= 0
  return (
    <div
      className={`card bento-summary${className ? ` ${className}` : ''}`}
      style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ fontWeight: 600, fontSize: 15, color: 'var(--text-1)' }}>Investasi</h2>
        <button
          className="btn-ghost"
          onClick={() => goto('inv')}
          style={{ padding: '6px 12px', minHeight: 36, fontSize: 13 }}
        >
          Detail
        </button>
      </div>
      <div>
        <div className="muted" style={{ fontSize: 12 }}>Total Nilai</div>
        <div className="num-lg" style={{ color: 'var(--text-1)', marginTop: 2 }}>
          {formatShort(total.value)}
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 12px' }}>
        <div>
          <div className="muted" style={{ fontSize: 12 }}>Modal</div>
          <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, fontSize: 14, color: 'var(--text-1)' }}>
            {formatShort(total.totalBought)}
          </div>
        </div>
        <div>
          <div className="muted" style={{ fontSize: 12 }}>Untung / Rugi</div>
          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontWeight: 600,
              fontSize: 14,
              color: plPositive ? 'var(--income)' : 'var(--expense)',
            }}
          >
            {total.totalPL >= 0 ? '+' : ''}{formatShort(total.totalPL)}
          </div>
        </div>
        <div>
          <div className="muted" style={{ fontSize: 12 }}>ROI</div>
          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontWeight: 600,
              fontSize: 14,
              color: (total.roi ?? 0) >= 0 ? 'var(--income)' : 'var(--expense)',
            }}
          >
            {formatPercent(total.roi)}
          </div>
        </div>
        <div>
          <div className="muted" style={{ fontSize: 12 }}>CAGR</div>
          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontWeight: 600,
              fontSize: 14,
              color: (total.cagr ?? 0) >= 0 ? 'var(--income)' : 'var(--expense)',
            }}
          >
            {formatPercent(total.cagr)}
          </div>
        </div>
      </div>
    </div>
  )
}

// ──────────────────────────────────────────────────────
// Recent Transactions
// ──────────────────────────────────────────────────────
function RecentTx({ goto }: { goto: (tab: string) => void }) {
  const { db } = useStore()
  const recent = useMemo(
    () =>
      [...db.transactions]
        .sort((a, b) => b.occurred_on.localeCompare(a.occurred_on))
        .slice(0, 6),
    [db.transactions],
  )

  return (
    <div className="card bento-full">
      <div
        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}
      >
        <h2 style={{ fontWeight: 600, fontSize: 15, color: 'var(--text-1)' }}>Transaksi Terbaru</h2>
        <button
          className="btn-ghost"
          onClick={() => goto('tx')}
          style={{ padding: '6px 12px', minHeight: 36, fontSize: 13 }}
        >
          Lihat semua
        </button>
      </div>
      {recent.length === 0 ? (
        <p className="muted">Belum ada transaksi.</p>
      ) : (
        <div className="divide-token">
          {recent.map((tx) => {
            const cat = db.categories.find((c) => c.id === tx.category_id)
            const isIncome = tx.kind === 'income'
            return (
              <div
                key={tx.id}
                style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0' }}
              >
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 'var(--radius-sm)',
                    background: isIncome ? 'var(--income)' : 'var(--expense)',
                    color: isIncome ? 'var(--income-fg)' : 'var(--expense-fg)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                    fontSize: 16,
                    fontWeight: 700,
                  }}
                  aria-hidden="true"
                >
                  {isIncome ? '+' : '-'}
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
                    {tx.note || cat?.name || (isIncome ? 'Pemasukan' : 'Pengeluaran')}
                  </div>
                  <div className="muted" style={{ fontSize: 12 }}>
                    {dateLabel(tx.occurred_on)}
                    {cat && ` · ${cat.name}`}
                  </div>
                </div>
                <div
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontWeight: 600,
                    fontSize: 14,
                    color: isIncome ? 'var(--income)' : 'var(--expense)',
                    textAlign: 'right' as const,
                    flexShrink: 0,
                  }}
                >
                  {isIncome ? '+' : '-'}{formatShort(tx.amount)}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ──────────────────────────────────────────────────────
// Recurring Due
// ──────────────────────────────────────────────────────
function RecurringDue({ month, goto }: { month: string; goto: (tab: string) => void }) {
  const { db } = useStore()

  const { due, done, total } = useMemo(() => {
    const monthDate = `${month}-01`
    const rules = db.recurring_rules.filter((r) => r.active)
    const checks = db.recurring_checks.filter((c) => c.month === monthDate)
    const doneIds = new Set(checks.map((c) => c.rule_id))
    const due = rules.filter((r) => !doneIds.has(r.id)).sort((a, b) => a.day_of_month - b.day_of_month)
    return { due, done: rules.length - due.length, total: rules.length }
  }, [db, month])

  if (total === 0) return null

  return (
    <div className="card bento-half">
      <div
        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}
      >
        <h2 style={{ fontWeight: 600, fontSize: 15, color: 'var(--text-1)' }}>Checklist Rutin</h2>
        <button
          className="btn-ghost"
          onClick={() => goto('rec')}
          style={{ padding: '6px 12px', minHeight: 36, fontSize: 13 }}
        >
          Buka
        </button>
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 8 }}>
        <span
          style={{ fontFamily: 'var(--font-mono)', fontSize: 30, fontWeight: 600, color: 'var(--text-1)' }}
        >
          {done}
        </span>
        <span className="muted">/ {total} selesai</span>
      </div>
      <div
        style={{
          height: 6,
          borderRadius: 3,
          background: 'var(--surface-2)',
          overflow: 'hidden',
          marginBottom: 12,
          border: '1px solid var(--border)',
        }}
      >
        <div
          style={{
            height: '100%',
            width: `${total > 0 ? (done / total) * 100 : 0}%`,
            background: 'var(--income)',
            borderRadius: 3,
            transition: 'width 400ms ease-out',
          }}
        />
      </div>
      {due.slice(0, 4).map((r) => (
        <div
          key={r.id}
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '7px 0',
            borderTop: '1px solid var(--border)',
          }}
        >
          <div style={{ fontSize: 14, color: 'var(--text-1)' }}>{r.name}</div>
          <div className="muted" style={{ fontSize: 12 }}>Tgl {r.day_of_month}</div>
        </div>
      ))}
      {due.length > 4 && (
        <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
          +{due.length - 4} lainnya
        </div>
      )}
    </div>
  )
}

// ──────────────────────────────────────────────────────
// Balance Card — total saldo rekening + peringatan trade belum ditentukan
// ──────────────────────────────────────────────────────
function BalanceCard({ goto }: { goto: (tab: string) => void }) {
  const { db } = useStore()

  const { total, perAccount, unassigned } = useMemo(() => {
    const perAccount = db.accounts.map((a) => ({
      id: a.id,
      name: a.name,
      balance: accountBalance(a, db.transactions, db.trades),
    }))
    const total = perAccount.reduce((s, a) => s + a.balance, 0)
    const unassigned = unassignedTrades(db.trades)
    return { total, perAccount, unassigned }
  }, [db.accounts, db.transactions, db.trades])

  const topAccounts = [...perAccount].sort((a, b) => b.balance - a.balance).slice(0, 3)

  return (
    <div className="card bento-pair" data-testid="card-balance" style={{ display: 'flex', flexDirection: 'column', height: '100%', minWidth: 0 }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 10,
        }}
      >
        <h2 style={{ fontWeight: 600, fontSize: 15, color: 'var(--text-1)' }}>Saldo Rekening</h2>
        <button
          className="btn-ghost"
          onClick={() => {
            window.location.hash = 'lap'
          }}
          style={{ padding: '6px 12px', minHeight: 36, fontSize: 13 }}
        >
          Lihat laporan
        </button>
      </div>
      {db.accounts.length === 0 ? (
        <p className="muted">Belum ada rekening. Tambahkan di Pengaturan.</p>
      ) : (
        <>
          <div style={{ marginBottom: 10 }}>
            <div className="muted" style={{ fontSize: 12 }}>Total saldo</div>
            <div className="num-lg" style={{ color: 'var(--text-1)', marginTop: 2 }}>
              {formatShort(total)}
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
            {topAccounts.map((a) => (
              <div
                key={a.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: 10,
                  minWidth: 0,
                  alignItems: 'baseline',
                }}
              >
                <span
                  style={{
                    fontSize: 13,
                    color: 'var(--text-2)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    minWidth: 0,
                    flex: 1,
                  }}
                >
                  {a.name}
                </span>
                <span
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 13,
                    fontWeight: 500,
                    color: a.balance < 0 ? 'var(--expense)' : 'var(--text-1)',
                    flexShrink: 0,
                  }}
                >
                  {formatShort(a.balance)}
                </span>
              </div>
            ))}
            {perAccount.length > topAccounts.length && (
              <div className="muted" style={{ fontSize: 12 }}>
                +{perAccount.length - topAccounts.length} rekening lainnya
              </div>
            )}
          </div>
        </>
      )}
      {unassigned.trades.length > 0 && (
        <button
          type="button"
          className="chip chip-warn"
          onClick={() => goto('inv')}
          style={{
            marginTop: 12,
            display: 'flex',
            alignItems: 'flex-start',
            gap: 6,
            cursor: 'pointer',
            alignSelf: 'stretch',
            whiteSpace: 'normal',
            textAlign: 'left',
            minHeight: 44,
            lineHeight: 1.5,
            borderRadius: 'var(--radius-md)',
          }}
        >
          <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 2 }} />
          <span>
            {unassigned.trades.length} catatan investasi belum ditentukan sumber dananya ({formatShort(unassigned.totalValue)})
          </span>
        </button>
      )}
    </div>
  )
}

// ──────────────────────────────────────────────────────
// Dashboard
// ──────────────────────────────────────────────────────
export default function Dashboard({ goto }: { goto: (tab: string) => void }) {
  const { db, ready } = useStore()
  const { rows, total, at, live } = usePortfolio()
  const [month, setMonth] = useState(() => monthKey(todayISO()))
  const monthDefaultSet = useRef(false)

  useEffect(() => {
    if (!ready || monthDefaultSet.current) return
    monthDefaultSet.current = true
    const today = monthKey(todayISO())
    const txMonths = db.transactions.map((t) => monthKey(t.occurred_on))
    if (txMonths.length === 0) return
    const last = txMonths.reduce((a, b) => (a > b ? a : b))
    if (last <= today) setMonth(last)
  }, [ready, db.transactions])

  const m = useMemo(() => {
    const report = monthReport(month, db.accounts, db.categories, db.transactions, db.trades)

    const byCat = new Map<string, number>()
    for (const t of db.transactions.filter(
      (x) => x.kind === 'expense' && x.occurred_on.startsWith(month),
    )) {
      const name = db.categories.find((c) => c.id === t.category_id)?.name ?? 'Tanpa kategori'
      byCat.set(name, (byCat.get(name) ?? 0) + t.amount)
    }
    const cats = [...byCat.entries()].sort((a, b) => b[1] - a[1]) as [string, number][]

    return {
      income: report.income,
      expense: report.expense,
      invest: report.investBuy,
      left: report.net,
      cats,
    }
  }, [db, month])

  const barData = useMemo(
    () =>
      Array.from({ length: 6 }, (_, i) => {
        const mk = shiftMonth(month, i - 5)
        const tx = db.transactions.filter((t) => t.occurred_on.startsWith(mk))
        return {
          month: mk,
          income: tx.filter((t) => t.kind === 'income').reduce((s, t) => s + t.amount, 0),
          expense: tx.filter((t) => t.kind === 'expense').reduce((s, t) => s + t.amount, 0),
        }
      }),
    [db.transactions, month],
  )

  const platformCards = useMemo((): PlatformCard[] => {
    const map = new Map<string, PlatformCard>()
    for (const row of rows) {
      const price = row.price ?? 0
      const byPlatform = new Map<string, typeof row.trades>()
      for (const t of row.trades) {
        const pid = t.platform_id ?? '__none__'
        if (!byPlatform.has(pid)) byPlatform.set(pid, [])
        byPlatform.get(pid)!.push(t)
      }
      for (const [pid, trades] of byPlatform) {
        const name =
          pid === '__none__'
            ? 'Lainnya'
            : (db.platforms.find((p) => p.id === pid)?.name ?? 'Platform')
        if (!map.has(pid)) map.set(pid, { id: pid, name, cost: 0, value: 0, pl: 0, symbols: [] })
        const pf = map.get(pid)!
        let qty = 0, cost = 0
        for (const t of trades) {
          if (t.side === 'buy') { qty += t.quantity; cost += t.quantity * t.price_per_unit + t.fee }
          else { qty -= t.quantity; cost -= t.quantity * t.price_per_unit - t.fee }
        }
        pf.cost += cost
        pf.value += qty * price
        if (!pf.symbols.includes(row.asset.symbol)) pf.symbols.push(row.asset.symbol)
      }
    }
    return [...map.values()]
      .map((p) => ({ ...p, pl: p.value - p.cost }))
      .filter((p) => p.value > 0 || p.cost > 0)
      .sort((a, b) => b.value - a.value)
  }, [rows, db.platforms])

  const isCurrentMonth = month === monthKey(todayISO())

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
      {/* Segmented: Ringkasan | Laporan — hanya di mobile, desktop pakai sidebar */}
      <div
        className="md:hidden"
        style={{
          display: 'flex',
          background: 'var(--surface-2)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-md)',
          padding: 2,
          gap: 2,
        }}
      >
        <button
          aria-current="page"
          style={{
            flex: 1,
            minHeight: 40,
            padding: '0 16px',
            borderRadius: 'calc(var(--radius-md) - 2px)',
            border: 'none',
            background: 'var(--surface)',
            color: 'var(--text-1)',
            fontWeight: 600,
            fontSize: 14,
            cursor: 'default',
            fontFamily: 'inherit',
            boxShadow: 'var(--shadow-sm)',
          }}
        >
          Ringkasan
        </button>
        <button
          onClick={() => goto('lap')}
          style={{
            flex: 1,
            minHeight: 40,
            padding: '0 16px',
            borderRadius: 'calc(var(--radius-md) - 2px)',
            border: 'none',
            background: 'transparent',
            color: 'var(--text-2)',
            fontWeight: 500,
            fontSize: 14,
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          Laporan
        </button>
      </div>

      {/* Month selector */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
        }}
      >
        <h1
          style={{
            fontWeight: 700,
            fontSize: 22,
            color: 'var(--text-1)',
            letterSpacing: '-0.02em',
          }}
        >
          Ringkasan
        </h1>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-md)',
            overflow: 'hidden',
          }}
        >
          <button
            onClick={() => setMonth((m) => shiftMonth(m, -1))}
            className="btn-ghost"
            aria-label="Bulan sebelumnya"
            style={{ border: 'none', borderRadius: 0, minHeight: 40, padding: '0 10px' }}
          >
            <ChevronLeft size={16} />
          </button>
          <span
            style={{
              padding: '0 4px',
              fontSize: 13,
              fontWeight: 500,
              minWidth: 110,
              textAlign: 'center',
              color: 'var(--text-1)',
              textTransform: 'capitalize',
            }}
          >
            {monthLabel(month)}
          </span>
          <button
            onClick={() => setMonth((m) => shiftMonth(m, 1))}
            className="btn-ghost"
            aria-label="Bulan berikutnya"
            disabled={isCurrentMonth}
            style={{ border: 'none', borderRadius: 0, minHeight: 40, padding: '0 10px' }}
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      {/* Bento — urutan DOM = urutan visual untuk screen reader dan Tab */}
      <div className="bento">
        {/* 1. Kartu hero investasi + ringkasan (baris atas) */}
        <PortfolioStack
          data-testid="dashboard-hero"
          cards={platformCards}
          totalValue={total.value}
          totalBought={total.totalBought}
          totalPL={total.totalPL}
          roi={total.roi}
          live={live}
          at={at}
          goto={goto}
        />

        <InvestmentSummary total={total} goto={goto} className="hidden md:block" />

        {/* 2. Empat KPI bulan ini */}
        <KpiCard label="Pemasukan" value={m.income} token="var(--income)" index={0} testId="kpi-pemasukan" />
        <KpiCard label="Pengeluaran" value={m.expense} token="var(--expense)" index={1} />
        <KpiCard label="Investasi (beli)" value={m.invest} token="var(--invest)" index={2} />
        <KpiCard
          label="Sisa bulan ini"
          value={m.left}
          token={m.left >= 0 ? 'var(--income)' : 'var(--expense)'}
          sub="masuk - keluar - investasi"
          index={3}
        />

        {/* 3. Baris 1 — dua kolom berdampingan di >= 1024px */}
        <BalanceCard goto={goto} />

        {/* Donut chart card */}
        <div className="card bento-pair" data-testid="card-donut" style={{ display: 'flex', flexDirection: 'column', height: '100%', minWidth: 0 }}>
          <h2 style={{ fontWeight: 600, fontSize: 15, color: 'var(--text-1)', marginBottom: 12 }}>
            Pengeluaran per Kategori
          </h2>
          {m.cats.length === 0 ? (
            <p className="muted">Belum ada pengeluaran bulan ini.</p>
          ) : (
            <>
              <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap', flex: 1, minWidth: 0 }}>
                <DonutChart cats={m.cats} />
                <div style={{ flex: 1, minWidth: 90, overflow: 'hidden' }}>
                  {m.cats.slice(0, 6).map(([name, v], i) => (
                    <div
                      key={name}
                      style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}
                    >
                      <div
                        style={{
                          width: 10,
                          height: 10,
                          borderRadius: 2,
                          background: CAT_TOKENS[i % CAT_TOKENS.length],
                          flexShrink: 0,
                        }}
                      />
                      <div
                        style={{
                          fontSize: 12,
                          color: 'var(--text-2)',
                          flex: 1,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          minWidth: 0,
                        }}
                      >
                        {name}
                      </div>
                      <div
                        style={{
                          fontFamily: 'var(--font-mono)',
                          fontSize: 12,
                          color: 'var(--text-1)',
                          fontWeight: 500,
                          flexShrink: 0,
                        }}
                      >
                        {formatShort(v)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              {m.cats.length > 6 && (
                <button
                  className="btn-ghost"
                  onClick={() => { window.location.hash = 'lap' }}
                  style={{ marginTop: 8, padding: '4px 0', fontSize: 12, alignSelf: 'flex-start', minHeight: 'unset' }}
                >
                  Lihat semua ({m.cats.length} kategori)
                </button>
              )}
            </>
          )}
        </div>

        {/* Baris 2 — grafik batang selebar penuh */}
        <div className="card bento-full" data-testid="card-bar" style={{ minWidth: 0 }}>
          <h2 style={{ fontWeight: 600, fontSize: 15, color: 'var(--text-1)', marginBottom: 12 }}>
            Pemasukan vs Pengeluaran
          </h2>
          <BarChart data={barData} />
        </div>

        <RecentTx goto={goto} />

        <RecurringDue month={month} goto={goto} />
      </div>
    </div>
  )
}
