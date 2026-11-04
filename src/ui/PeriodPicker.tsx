import { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import { useReducedMotion } from 'motion/react'
import type { DashPeriod, PeriodKind } from '../lib/period'
import { shortMonthYear } from '../lib/period'
import { Sheet } from './Sheet'

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des']
const MONTH_NAMES_FULL = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember']

function todayMonth(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function addMonths(key: string, delta: number): string {
  const [y, m] = key.split('-').map(Number)
  const d = new Date(y, m - 1 + delta, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth < 768)
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)')
    const handle = (e: MediaQueryListEvent) => setIsMobile(e.matches)
    mq.addEventListener('change', handle)
    return () => mq.removeEventListener('change', handle)
  }, [])
  return isMobile
}

// ── Month Range Picker body (shared between sheet and popover) ──────────────

interface RangePickerBodyProps {
  tempFrom: string | null
  tempTo: string | null
  viewYear: number
  monthsWithData: Set<string>
  onMonthClick: (mk: string) => void
  onYearPrev: () => void
  onYearNext: () => void
  onApply: () => void
  onCancel: () => void
}

function RangePickerBody({
  tempFrom, tempTo, viewYear, monthsWithData,
  onMonthClick, onYearPrev, onYearNext,
}: RangePickerBodyProps) {
  const reduced = useReducedMotion()
  const today = todayMonth()
  const todayYear = parseInt(today.slice(0, 4))

  const rangeMin = tempFrom && tempTo ? (tempFrom < tempTo ? tempFrom : tempTo) : null
  const rangeMax = tempFrom && tempTo ? (tempFrom > tempTo ? tempFrom : tempTo) : null
  const hasRange = !!(rangeMin && rangeMax)

  const summaryText = (() => {
    if (!tempFrom) return 'Pilih bulan'
    if (tempFrom && !tempTo) return shortMonthYear(tempFrom)
    if (tempFrom && tempTo) {
      const a = tempFrom < tempTo ? tempFrom : tempTo
      const b = tempFrom < tempTo ? tempTo : tempFrom
      if (a === b) return shortMonthYear(a)
      return `${shortMonthYear(a)} sampai ${shortMonthYear(b)}`
    }
    return ''
  })()

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Year navigation */}
      <div
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}
      >
        <button
          className="btn-ghost"
          onClick={onYearPrev}
          aria-label="Tahun sebelumnya"
          style={{ minHeight: 44, minWidth: 44, padding: '0 8px', border: 'none', borderRadius: 'var(--radius-sm)' }}
        >
          <ChevronLeft size={18} />
        </button>
        <span style={{ fontWeight: 600, fontSize: 15, color: 'var(--text-1)', userSelect: 'none' }}>
          {viewYear}
        </span>
        <button
          className="btn-ghost"
          onClick={onYearNext}
          disabled={viewYear >= todayYear}
          aria-label="Tahun berikutnya"
          style={{ minHeight: 44, minWidth: 44, padding: '0 8px', border: 'none', borderRadius: 'var(--radius-sm)' }}
        >
          <ChevronRight size={18} />
        </button>
      </div>

      {/* 4x3 month grid */}
      <div
        role="grid"
        aria-label={`Pilih bulan tahun ${viewYear}`}
        style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 4 }}
      >
        {MONTH_NAMES.map((name, i) => {
          const mk = `${viewYear}-${String(i + 1).padStart(2, '0')}`
          const isFuture = mk > today
          const isStart = tempFrom === mk
          const isEnd = tempTo === mk
          const inRange = hasRange && mk > rangeMin! && mk < rangeMax!
          const hasData = monthsWithData.has(mk)
          const isSelected = isStart || isEnd

          let bg = 'transparent'
          let color = isFuture ? 'var(--text-3)' : 'var(--text-1)'
          const borderRadius = 'var(--radius-sm)'

          if (isSelected) {
            bg = 'var(--primary)'
            color = 'var(--primary-fg)'
          } else if (inRange) {
            bg = 'color-mix(in srgb, var(--primary) 15%, transparent)'
            color = 'var(--text-1)'
          }

          return (
            <button
              key={mk}
              role="gridcell"
              aria-label={`${MONTH_NAMES_FULL[i]} ${viewYear}${hasData ? ', ada data' : ''}`}
              aria-pressed={isSelected}
              aria-disabled={isFuture}
              disabled={isFuture}
              onClick={() => onMonthClick(mk)}
              style={{
                position: 'relative',
                minHeight: 44,
                borderRadius,
                border: 'none',
                background: bg,
                color,
                fontSize: 13,
                fontWeight: isSelected ? 600 : 400,
                cursor: isFuture ? 'default' : 'pointer',
                fontFamily: 'inherit',
                transition: reduced ? 'none' : 'background 120ms ease-out, color 120ms ease-out',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 2,
              }}
            >
              <span>{name}</span>
              {hasData && (
                <span
                  aria-hidden="true"
                  style={{
                    width: 4,
                    height: 4,
                    borderRadius: '50%',
                    background: isSelected ? 'var(--primary-fg)' : 'var(--accent)',
                    display: 'block',
                  }}
                />
              )}
            </button>
          )
        })}
      </div>

      {/* Range summary */}
      <div
        className="muted"
        style={{ fontSize: 13, minHeight: 20 }}
        aria-live="polite"
        aria-atomic="true"
      >
        {summaryText}
      </div>
    </div>
  )
}

// ── Main PeriodPicker component ─────────────────────────────────────────────

interface PeriodPickerProps {
  period: DashPeriod
  onChange: (p: DashPeriod) => void
  monthsWithData: Set<string>
  summaryLabel: string
  'data-testid'?: string
}

export function PeriodPicker({ period, onChange, monthsWithData, summaryLabel, 'data-testid': testId }: PeriodPickerProps) {
  const isMobile = useIsMobile()
  const reduced = useReducedMotion()

  // Picker open state
  const [pickerOpen, setPickerOpen] = useState(false)

  // Temp selection state inside picker
  const [tempFrom, setTempFrom] = useState<string | null>(null)
  const [tempTo, setTempTo] = useState<string | null>(null)
  const [viewYear, setViewYear] = useState(() => new Date().getFullYear())

  // Trigger button ref (for popover anchoring on desktop)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const [popoverPos, setPopoverPos] = useState<{ top: number; left: number; width: number } | null>(null)

  // Reset temp state when picker opens
  const openPicker = useCallback(() => {
    if (period.custom) {
      setTempFrom(period.custom.from)
      setTempTo(period.custom.to)
      setViewYear(parseInt(period.custom.to.slice(0, 4)))
    } else {
      setTempFrom(null)
      setTempTo(null)
      setViewYear(new Date().getFullYear())
    }

    if (!isMobile && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect()
      setPopoverPos({
        top: rect.bottom + window.scrollY + 4,
        left: rect.left + window.scrollX,
        width: Math.max(320, rect.width),
      })
    }

    setPickerOpen(true)
  }, [period.custom, isMobile])

  const closePicker = useCallback(() => {
    setPickerOpen(false)
  }, [])

  const handleApply = useCallback(() => {
    if (!tempFrom) return
    const end = tempTo ?? tempFrom
    const a = tempFrom <= end ? tempFrom : end
    const b = tempFrom <= end ? end : tempFrom
    onChange({ kind: 'custom', custom: { from: a, to: b } })
    closePicker()
  }, [tempFrom, tempTo, onChange, closePicker])

  const handleMonthClick = useCallback((mk: string) => {
    if (!tempFrom || (tempFrom && tempTo)) {
      // Start new selection
      setTempFrom(mk)
      setTempTo(null)
    } else {
      // Complete the range
      setTempTo(mk)
    }
  }, [tempFrom, tempTo])

  // Esc closes popover
  useEffect(() => {
    if (!pickerOpen || isMobile) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closePicker()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [pickerOpen, isMobile, closePicker])

  const handleKindChange = useCallback((kind: PeriodKind) => {
    if (kind === 'custom') {
      openPicker()
    } else {
      onChange({ kind, custom: period.kind === 'custom' ? period.custom : null })
    }
  }, [onChange, openPicker, period])

  // Keyboard navigation for segmented control
  const handleKeyDown = useCallback((e: React.KeyboardEvent, kinds: PeriodKind[], currentKind: PeriodKind) => {
    const idx = kinds.indexOf(currentKind)
    if (e.key === 'ArrowRight') {
      e.preventDefault()
      const next = kinds[(idx + 1) % kinds.length]
      handleKindChange(next)
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault()
      const prev = kinds[(idx - 1 + kinds.length) % kinds.length]
      handleKindChange(prev)
    }
  }, [handleKindChange])

  const kinds: PeriodKind[] = ['month', 'custom']
  const kindLabels: Record<PeriodKind, string> = { all: 'Semua', month: 'Bulan ini', custom: 'Kustom' }
  // 'all' dihapus dari UI; kalau masih ada di localStorage, perlakukan sebagai 'month'
  const effectiveKind: PeriodKind = period.kind === 'all' ? 'month' : period.kind

  const canApply = !!tempFrom

  const pickerFooter = (
    <div style={{ display: 'flex', gap: 8 }}>
      <button
        className="btn-ghost"
        onClick={closePicker}
        style={{ flex: 1, minHeight: 44 }}
      >
        Batal
      </button>
      <button
        className="btn"
        onClick={handleApply}
        disabled={!canApply}
        style={{ flex: 2, minHeight: 44 }}
      >
        Terapkan
      </button>
    </div>
  )

  return (
    <div data-testid={testId}>
      {/* Segmented control */}
      <div
        role="radiogroup"
        aria-label="Pilih periode"
        style={{
          display: 'flex',
          background: 'var(--surface-2)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-md)',
          padding: 3,
          gap: 2,
        }}
      >
        {kinds.map((k) => {
          const isActive = effectiveKind === k
          return (
            <button
              key={k}
              ref={k === 'custom' ? triggerRef : undefined}
              role="radio"
              aria-checked={isActive}
              onClick={() => handleKindChange(k)}
              onKeyDown={(e) => handleKeyDown(e, kinds, effectiveKind)}
              tabIndex={isActive ? 0 : -1}
              style={{
                flex: 1,
                minHeight: 44,
                padding: '0 8px',
                borderRadius: 'calc(var(--radius-md) - 3px)',
                border: 'none',
                background: isActive ? 'var(--surface)' : 'transparent',
                color: isActive ? 'var(--text-1)' : 'var(--text-3)',
                fontWeight: isActive ? 600 : 400,
                fontSize: 14,
                cursor: 'pointer',
                fontFamily: 'inherit',
                boxShadow: isActive ? 'var(--shadow-sm)' : 'none',
                transition: reduced ? 'none' : 'background 150ms ease-out, color 150ms ease-out, box-shadow 150ms ease-out',
              }}
            >
              {kindLabels[k]}
            </button>
          )
        })}
      </div>

      {/* Period summary text */}
      <div
        className="muted"
        style={{ fontSize: 12, marginTop: 8 }}
        aria-live="polite"
      >
        {summaryLabel}
      </div>

      {/* Mobile: Sheet */}
      {isMobile && (
        <Sheet
          open={pickerOpen}
          onClose={closePicker}
          title="Pilih Rentang Bulan"
          footer={pickerFooter}
        >
          <RangePickerBody
            tempFrom={tempFrom}
            tempTo={tempTo}
            viewYear={viewYear}
            monthsWithData={monthsWithData}
            onMonthClick={handleMonthClick}
            onYearPrev={() => setViewYear((y) => y - 1)}
            onYearNext={() => setViewYear((y) => y + 1)}

            onApply={handleApply}
            onCancel={closePicker}
          />
        </Sheet>
      )}

      {/* Desktop: Popover portal */}
      {!isMobile && pickerOpen && popoverPos && createPortal(
        <>
          {/* Transparent backdrop */}
          <div
            onClick={closePicker}
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 'var(--z-backdrop)' as unknown as number,
            }}
            aria-hidden="true"
          />
          {/* Popover */}
          <div
            role="dialog"
            aria-label="Pilih rentang bulan"
            style={{
              position: 'absolute',
              top: popoverPos.top,
              left: popoverPos.left,
              width: Math.min(popoverPos.width + 160, 380),
              zIndex: 'var(--z-sheet)' as unknown as number,
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-lg)',
              boxShadow: 'var(--shadow-lg)',
              padding: 20,
              display: 'flex',
              flexDirection: 'column',
              gap: 16,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontWeight: 600, fontSize: 15, color: 'var(--text-1)' }}>
                Pilih Rentang Bulan
              </span>
              <button
                className="btn-ghost"
                onClick={closePicker}
                aria-label="Tutup pemilih rentang"
                style={{ padding: 6, minHeight: 36, minWidth: 36, border: 'none' }}
              >
                <X size={16} />
              </button>
            </div>
            <RangePickerBody
              tempFrom={tempFrom}
              tempTo={tempTo}
              viewYear={viewYear}
              monthsWithData={monthsWithData}
              onMonthClick={handleMonthClick}
              onYearPrev={() => setViewYear((y) => y - 1)}
              onYearNext={() => setViewYear((y) => y + 1)}
  
              onApply={handleApply}
              onCancel={closePicker}
            />
            {pickerFooter}
          </div>
        </>,
        document.body,
      )}
    </div>
  )
}
