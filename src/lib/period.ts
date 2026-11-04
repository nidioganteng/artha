import type { PeriodKind, PeriodCustom } from './calc'
import { monthLabel } from './format'

export type { PeriodKind, PeriodCustom }

export interface DashPeriod {
  kind: PeriodKind
  custom: PeriodCustom | null
}

const YM_RE = /^\d{4}-\d{2}$/

export function loadPeriod(key: string): DashPeriod {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return { kind: 'all', custom: null }
    const p = JSON.parse(raw) as Record<string, unknown>
    if (p.kind !== 'all' && p.kind !== 'month' && p.kind !== 'custom') return { kind: 'all', custom: null }
    if (p.kind === 'custom') {
      const c = p.custom as Record<string, unknown> | null
      if (!c || typeof c.from !== 'string' || typeof c.to !== 'string') return { kind: 'all', custom: null }
      if (!YM_RE.test(c.from) || !YM_RE.test(c.to)) return { kind: 'all', custom: null }
      return { kind: 'custom', custom: { from: c.from, to: c.to } }
    }
    return { kind: p.kind as PeriodKind, custom: null }
  } catch {
    return { kind: 'all', custom: null }
  }
}

export function savePeriod(key: string, period: DashPeriod): void {
  try { localStorage.setItem(key, JSON.stringify(period)) } catch { /* ignore */ }
}

export function loadDashPeriod(): DashPeriod { return loadPeriod('artha:dashPeriod') }
export function saveDashPeriod(period: DashPeriod): void { savePeriod('artha:dashPeriod', period) }

export function shortMonthYear(monthKey: string): string {
  const [y, m] = monthKey.split('-').map(Number)
  return new Intl.DateTimeFormat('id-ID', { month: 'short', year: 'numeric' }).format(new Date(y, m - 1, 1))
}

function monthsBetweenCount(fromKey: string, toKey: string): number {
  const [fy, fm] = fromKey.split('-').map(Number)
  const [ty, tm] = toKey.split('-').map(Number)
  return (ty - fy) * 12 + (tm - fm) + 1
}

export function periodSummaryLabel(
  kind: PeriodKind,
  from: string,          // YYYY-MM-DD
  to: string,            // YYYY-MM-DD
  firstDate: string | null,
): string {
  if (kind === 'month') {
    return monthLabel(from.slice(0, 7))
  }
  if (kind === 'custom') {
    const fk = from.slice(0, 7)
    const tk = to.slice(0, 7)
    const count = monthsBetweenCount(fk, tk)
    if (fk === tk) return `${shortMonthYear(fk)} (1 bulan)`
    return `${shortMonthYear(fk)} sampai ${shortMonthYear(tk)} (${count} bulan)`
  }
  // all
  if (!firstDate) return 'Belum ada data'
  const fk = firstDate.slice(0, 7)
  const tk = to.slice(0, 7)
  if (fk === tk) return `Semua data (${shortMonthYear(fk)})`
  return `Semua data (${shortMonthYear(fk)} sampai ${shortMonthYear(tk)})`
}
