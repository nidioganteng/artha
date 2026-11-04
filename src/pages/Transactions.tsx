import { useMemo, useState, type FormEvent } from 'react'
import { Plus, Pencil, Trash2 } from 'lucide-react'
import { useStore } from '../lib/store'
import { dateLabel, idr, todayISO } from '../lib/format'
import { periodRange, barChartMonths } from '../lib/calc'
import { loadPeriod, savePeriod, periodSummaryLabel, shortMonthYear, type DashPeriod } from '../lib/period'
import { Sheet, EmptyState, Field, MoneyInput, ConfirmDialog } from '../ui'
import { PeriodPicker } from '../ui/PeriodPicker'
import type { Kind, Transaction } from '../lib/types'

const TX_PERIOD_KEY = 'artha:txPeriod'
const MONTH_ABB = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des']
type Filter = Kind | 'all'

function mostUsedCategoryId(
  transactions: { kind: Kind; category_id: string | null }[],
  categories: { id: string; kind: Kind }[],
  kind: Kind,
): string {
  const counts = new Map<string, number>()
  for (const tx of transactions.filter((t) => t.kind === kind && t.category_id)) {
    const id = tx.category_id!
    counts.set(id, (counts.get(id) ?? 0) + 1)
  }
  if (counts.size === 0) return ''
  const topId = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0]
  return categories.find((c) => c.id === topId)?.id ?? ''
}

// ── Line chart ────────────────────────────────────────────────────────────────

interface ChartData { month: string; income: number; expense: number }

function TxLineChart({ data, capped }: { data: ChartData[]; capped: boolean }) {
  const W = 400
  const H = 80
  const n = data.length
  const max = Math.max(...data.flatMap((d) => [d.income, d.expense]), 1)
  const vs = { vectorEffect: 'non-scaling-stroke' as const }

  const cx = (i: number) => (n <= 1 ? W / 2 : (i / (n - 1)) * W)
  const cy = (v: number) => (1 - v / max) * H

  const incomePoints = data.map((d, i) => `${cx(i).toFixed(1)},${cy(d.income).toFixed(1)}`).join(' ')
  const expensePoints = data.map((d, i) => `${cx(i).toFixed(1)},${cy(d.expense).toFixed(1)}`).join(' ')
  const incomeArea = `${cx(0).toFixed(1)},${H} ${incomePoints} ${cx(n - 1).toFixed(1)},${H}`
  const expenseArea = `${cx(0).toFixed(1)},${H} ${expensePoints} ${cx(n - 1).toFixed(1)},${H}`

  return (
    <div className="card" style={{ padding: '14px 16px 12px', marginBottom: 16 }}>
      <div style={{ display: 'flex', gap: 16, marginBottom: 10, alignItems: 'center' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--text-2)' }}>
          <span style={{ width: 18, height: 2, background: 'var(--income)', borderRadius: 1, display: 'inline-block', flexShrink: 0 }} />
          Masuk
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--text-2)' }}>
          <span style={{ width: 18, height: 2, background: 'var(--expense)', borderRadius: 1, display: 'inline-block', flexShrink: 0 }} />
          Keluar
        </span>
        {capped && <span className="muted" style={{ fontSize: 11, marginLeft: 'auto' }}>maks 12 bln</span>}
      </div>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        role="img"
        aria-label="Grafik pemasukan dan pengeluaran"
        style={{ width: '100%', height: H, display: 'block', overflow: 'visible' }}
      >
        {/* Grid */}
        <line x1={0} y1={0} x2={W} y2={0} stroke="var(--border)" strokeWidth={1} {...vs} />
        <line x1={0} y1={H / 2} x2={W} y2={H / 2} stroke="var(--border)" strokeWidth={0.5} {...vs} />
        <line x1={0} y1={H} x2={W} y2={H} stroke="var(--border)" strokeWidth={1} {...vs} />

        {/* Area fills */}
        <polygon points={incomeArea} fill="var(--income)" fillOpacity={0.08} stroke="none" />
        <polygon points={expenseArea} fill="var(--expense)" fillOpacity={0.08} stroke="none" />

        {/* Lines */}
        {n > 1 && (
          <>
            <polyline points={incomePoints} fill="none" stroke="var(--income)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" {...vs} />
            <polyline points={expensePoints} fill="none" stroke="var(--expense)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" {...vs} />
          </>
        )}

        {/* Dots */}
        {data.map((d, i) => (
          <g key={d.month}>
            <circle cx={cx(i)} cy={cy(d.income)} r={3} fill="var(--income)" stroke="var(--surface)" strokeWidth={1.5} {...vs}>
              <title>Masuk {shortMonthYear(d.month)}: {idr(d.income)}</title>
            </circle>
            <circle cx={cx(i)} cy={cy(d.expense)} r={3} fill="var(--expense)" stroke="var(--surface)" strokeWidth={1.5} {...vs}>
              <title>Keluar {shortMonthYear(d.month)}: {idr(d.expense)}</title>
            </circle>
          </g>
        ))}
      </svg>

      {/* Month labels */}
      <div style={{ display: 'flex', marginTop: 4 }}>
        {data.map((d, i) => (
          <div
            key={d.month}
            style={{
              flex: 1,
              fontSize: 10,
              color: 'var(--text-3)',
              textAlign: i === 0 ? 'left' : i === n - 1 ? 'right' : 'center',
              ...(n > 8 && i > 0 && i < n - 1 && i % 2 === 1 ? { visibility: 'hidden' } : {}),
            }}
          >
            {MONTH_ABB[parseInt(d.month.slice(5, 7)) - 1]}
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function Transactions() {
  const { db, save, remove, failedIds } = useStore()

  // Period
  const [period, setPeriod] = useState<DashPeriod>(() => loadPeriod(TX_PERIOD_KEY))

  const firstDate = useMemo(() => {
    const dates = db.transactions.map((t) => t.occurred_on)
    return dates.length ? dates.reduce((a, b) => (a < b ? a : b)) : todayISO()
  }, [db.transactions])

  const range = useMemo(
    () => periodRange(period.kind, period.custom, todayISO(), firstDate),
    [period, firstDate],
  )

  const summaryLabel = useMemo(
    () => periodSummaryLabel(period.kind, range.from, range.to, firstDate),
    [period.kind, range, firstDate],
  )

  const monthsWithData = useMemo(
    () => new Set(db.transactions.map((t) => t.occurred_on.slice(0, 7))),
    [db.transactions],
  )

  // Filter
  const [filter, setFilter] = useState<Filter>('all')

  // Form state
  const [open, setOpen] = useState(false)
  const [editTx, setEditTx] = useState<Transaction | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Transaction | null>(null)
  const [kind, setKind] = useState<Kind>('expense')
  const [amountVal, setAmountVal] = useState<number | null>(null)
  const [categoryId, setCategoryId] = useState('')
  const [accountId, setAccountId] = useState(() => db.accounts[0]?.id ?? '')
  const effectiveAccountId =
    db.accounts.find((a) => a.id === accountId)?.id ?? db.accounts[0]?.id ?? ''
  const [date, setDate] = useState(todayISO)
  const [note, setNote] = useState('')
  const [formError, setFormError] = useState('')

  const cats = db.categories.filter((c) => c.kind === kind)

  // Period-filtered transactions
  const periodTx = useMemo(
    () => db.transactions.filter((t) => t.occurred_on >= range.from && t.occurred_on <= range.to),
    [db.transactions, range],
  )

  // Bar chart data
  const { months: chartMonths, capped: chartCapped } = useMemo(
    () => barChartMonths(range.from, range.to),
    [range],
  )
  const chartData = useMemo<ChartData[]>(
    () =>
      chartMonths.map((m) => ({
        month: m,
        income: periodTx
          .filter((t) => t.kind === 'income' && t.occurred_on.startsWith(m))
          .reduce((s, t) => s + t.amount, 0),
        expense: periodTx
          .filter((t) => t.kind === 'expense' && t.occurred_on.startsWith(m))
          .reduce((s, t) => s + t.amount, 0),
      })),
    [periodTx, chartMonths],
  )

  // Table rows (sorted, filtered by kind)
  const list = useMemo(() => {
    let txs = periodTx
    if (filter !== 'all') txs = txs.filter((t) => t.kind === filter)
    return [...txs].sort((a, b) => b.occurred_on.localeCompare(a.occurred_on))
  }, [periodTx, filter])

  // Totals for footer (from filtered list)
  const totals = useMemo(
    () => ({
      income: list.filter((t) => t.kind === 'income').reduce((s, t) => s + t.amount, 0),
      expense: list.filter((t) => t.kind === 'expense').reduce((s, t) => s + t.amount, 0),
    }),
    [list],
  )

  // Summary chips (always full period, ignore kind filter)
  const periodTotals = useMemo(
    () => ({
      income: periodTx.filter((t) => t.kind === 'income').reduce((s, t) => s + t.amount, 0),
      expense: periodTx.filter((t) => t.kind === 'expense').reduce((s, t) => s + t.amount, 0),
    }),
    [periodTx],
  )

  function openAdd() {
    setEditTx(null)
    setKind('expense')
    setDate(todayISO())
    setAmountVal(null)
    setNote('')
    setCategoryId(mostUsedCategoryId(db.transactions, db.categories, 'expense'))
    setAccountId(db.accounts[0]?.id ?? '')
    setFormError('')
    setOpen(true)
  }

  function openEdit(tx: Transaction) {
    setEditTx(tx)
    setKind(tx.kind)
    setAmountVal(tx.amount)
    setCategoryId(tx.category_id ?? '')
    setAccountId(tx.account_id ?? db.accounts[0]?.id ?? '')
    setDate(tx.occurred_on)
    setNote(tx.note ?? '')
    setFormError('')
    setOpen(true)
  }

  function submit(e: FormEvent) {
    e.preventDefault()
    if (amountVal == null || amountVal <= 0) {
      setFormError('Nominal harus lebih dari 0.')
      return
    }
    setFormError('')
    if (editTx) {
      save('transactions', {
        ...editTx,
        kind,
        amount: amountVal,
        category_id: categoryId || null,
        account_id: effectiveAccountId || null,
        occurred_on: date,
        note: note.trim() || null,
      })
    } else {
      save('transactions', {
        kind,
        amount: amountVal,
        category_id: categoryId || null,
        account_id: effectiveAccountId || null,
        occurred_on: date,
        note: note.trim() || null,
        recurring_rule_id: null,
        trade_id: null,
      })
    }
    setEditTx(null)
    setOpen(false)
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const thStyle: React.CSSProperties = {
    padding: '10px 12px',
    fontSize: 11,
    fontWeight: 600,
    color: 'var(--text-3)',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    textAlign: 'left',
    whiteSpace: 'nowrap',
    background: 'var(--surface-2)',
  }
  const tdStyle: React.CSSProperties = {
    padding: '8px 12px',
    fontSize: 13,
    color: 'var(--text-1)',
    borderTop: '1px solid var(--border)',
    verticalAlign: 'middle',
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      {/* Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 16,
        }}
      >
        <h1 style={{ fontWeight: 700, fontSize: 22, color: 'var(--text-1)', letterSpacing: '-0.02em' }}>
          Transaksi
        </h1>
        <button className="btn" onClick={openAdd} style={{ gap: 6 }}>
          <Plus size={16} />
          Tambah
        </button>
      </div>

      {/* Period picker */}
      <PeriodPicker
        period={period}
        onChange={(p) => { setPeriod(p); savePeriod(TX_PERIOD_KEY, p) }}
        monthsWithData={monthsWithData}
        summaryLabel={summaryLabel}
      />

      {/* Summary chips */}
      <div style={{ display: 'flex', gap: 8, marginTop: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <span className="chip chip-income">+{idr(periodTotals.income)}</span>
        <span className="chip chip-expense">-{idr(periodTotals.expense)}</span>
      </div>

      {/* Line chart */}
      {chartData.some((d) => d.income > 0 || d.expense > 0) && (
        <TxLineChart data={chartData} capped={chartCapped} />
      )}

      {/* Filter pills */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {(['all', 'expense', 'income'] as Filter[]).map((k) => {
          const active = filter === k
          return (
            <button
              key={k}
              onClick={() => setFilter(k)}
              style={{
                padding: '6px 14px',
                borderRadius: 9999,
                border: `1px solid ${active ? 'var(--primary)' : 'var(--border)'}`,
                background: active ? 'var(--primary)' : 'transparent',
                color: active ? 'var(--primary-fg)' : 'var(--text-2)',
                fontSize: 13,
                fontWeight: 500,
                cursor: 'pointer',
                minHeight: 44,
                fontFamily: 'inherit',
                transition: 'background 150ms ease-out, color 150ms ease-out',
              }}
            >
              {k === 'all' ? 'Semua' : k === 'expense' ? 'Pengeluaran' : 'Pemasukan'}
            </button>
          )
        })}
      </div>

      {/* Table or empty state */}
      {list.length === 0 ? (
        <EmptyState
          title="Belum ada transaksi"
          description="Belum ada transaksi di periode ini."
          action={
            <button className="btn" onClick={openAdd}>
              Tambah Transaksi
            </button>
          }
        />
      ) : (
        <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' as unknown as undefined }}>
          <table
            style={{
              width: '100%',
              minWidth: 580,
              borderCollapse: 'collapse',
              fontSize: 13,
            }}
          >
            <thead>
              <tr>
                <th style={{ ...thStyle, minWidth: 80 }}>Tanggal</th>
                <th style={{ ...thStyle, minWidth: 140, width: '30%' }}>Catatan</th>
                <th style={{ ...thStyle, minWidth: 100 }}>Kategori</th>
                <th style={{ ...thStyle, minWidth: 90 }}>Rekening</th>
                <th style={{ ...thStyle, minWidth: 110, textAlign: 'right' }}>Masuk</th>
                <th style={{ ...thStyle, minWidth: 110, textAlign: 'right' }}>Keluar</th>
                <th style={{ ...thStyle, width: 88 }} aria-label="Aksi" />
              </tr>
            </thead>
            <tbody>
              {list.map((tx) => {
                const cat = db.categories.find((c) => c.id === tx.category_id)?.name
                const acc = db.accounts.find((a) => a.id === tx.account_id)?.name
                const unsaved = failedIds.has(tx.id)
                const isIncome = tx.kind === 'income'
                const isLinkedTrade = tx.trade_id != null

                return (
                  <tr
                    key={tx.id}
                    style={{ opacity: unsaved ? 0.6 : 1, background: 'var(--surface)' }}
                  >
                    {/* Tanggal */}
                    <td style={{ ...tdStyle, color: 'var(--text-2)', whiteSpace: 'nowrap' }}>
                      {dateLabel(tx.occurred_on)}
                    </td>

                    {/* Catatan */}
                    <td style={{ ...tdStyle, maxWidth: 200 }}>
                      <div
                        style={{
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          fontWeight: 500,
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
                        }}
                      >
                        {tx.note || (isIncome ? 'Pemasukan' : 'Pengeluaran')}
                        {unsaved && (
                          <span style={{ fontSize: 11, color: 'var(--warn)', flexShrink: 0 }}>
                            belum tersimpan
                          </span>
                        )}
                      </div>
                      {isLinkedTrade && (
                        <span
                          className="chip"
                          style={{ fontSize: 11, padding: '1px 6px', marginTop: 2, display: 'inline-block' }}
                        >
                          Investasi
                        </span>
                      )}
                    </td>

                    {/* Kategori */}
                    <td style={{ ...tdStyle, color: 'var(--text-2)', whiteSpace: 'nowrap' }}>
                      {cat ?? <span style={{ color: 'var(--text-3)' }}>-</span>}
                    </td>

                    {/* Rekening */}
                    <td style={{ ...tdStyle, color: 'var(--text-2)', whiteSpace: 'nowrap' }}>
                      {acc ?? <span style={{ color: 'var(--text-3)' }}>-</span>}
                    </td>

                    {/* Masuk */}
                    <td
                      style={{
                        ...tdStyle,
                        textAlign: 'right',
                        fontFamily: 'var(--font-mono)',
                        fontWeight: 600,
                        color: isIncome ? 'var(--income)' : 'var(--text-3)',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {isIncome ? idr(tx.amount) : ''}
                    </td>

                    {/* Keluar */}
                    <td
                      style={{
                        ...tdStyle,
                        textAlign: 'right',
                        fontFamily: 'var(--font-mono)',
                        fontWeight: 600,
                        color: !isIncome ? 'var(--expense)' : 'var(--text-3)',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {!isIncome ? idr(tx.amount) : ''}
                    </td>

                    {/* Aksi */}
                    <td style={{ ...tdStyle, padding: '0 4px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                      {isLinkedTrade ? (
                        <span style={{ display: 'inline-block', width: 88 }} />
                      ) : (
                        <>
                          <button
                            className="btn-ghost"
                            aria-label="Edit transaksi"
                            onClick={() => openEdit(tx)}
                            style={{
                              padding: 8,
                              minHeight: 44,
                              minWidth: 44,
                              border: 'none',
                              color: 'var(--text-2)',
                            }}
                          >
                            <Pencil size={14} />
                          </button>
                          <button
                            className="btn-ghost"
                            aria-label="Hapus transaksi"
                            onClick={() => setDeleteTarget(tx)}
                            style={{
                              padding: 8,
                              minHeight: 44,
                              minWidth: 44,
                              border: 'none',
                              color: 'var(--expense)',
                            }}
                          >
                            <Trash2 size={14} />
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>

            {/* Total row */}
            <tfoot>
              <tr style={{ background: 'var(--surface-2)' }}>
                <td
                  colSpan={4}
                  style={{
                    ...tdStyle,
                    fontWeight: 700,
                    fontSize: 12,
                    letterSpacing: '0.04em',
                    textTransform: 'uppercase',
                    color: 'var(--text-2)',
                    borderTop: '2px solid var(--border)',
                  }}
                >
                  Total
                </td>
                <td
                  style={{
                    ...tdStyle,
                    textAlign: 'right',
                    fontFamily: 'var(--font-mono)',
                    fontWeight: 700,
                    fontSize: 14,
                    color: totals.income > 0 ? 'var(--income)' : 'var(--text-3)',
                    whiteSpace: 'nowrap',
                    borderTop: '2px solid var(--border)',
                  }}
                >
                  {totals.income > 0 ? idr(totals.income) : '-'}
                </td>
                <td
                  style={{
                    ...tdStyle,
                    textAlign: 'right',
                    fontFamily: 'var(--font-mono)',
                    fontWeight: 700,
                    fontSize: 14,
                    color: totals.expense > 0 ? 'var(--expense)' : 'var(--text-3)',
                    whiteSpace: 'nowrap',
                    borderTop: '2px solid var(--border)',
                  }}
                >
                  {totals.expense > 0 ? idr(totals.expense) : '-'}
                </td>
                <td style={{ ...tdStyle, borderTop: '2px solid var(--border)' }} />
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {/* Add/Edit Transaction Sheet */}
      <Sheet
        open={open}
        onClose={() => { setOpen(false); setEditTx(null) }}
        title={editTx ? 'Edit Transaksi' : 'Tambah Transaksi'}
        footer={
          <button type="submit" form="form-tx" className="btn" style={{ width: '100%' }}>
            {editTx ? 'Simpan Perubahan' : 'Simpan'}
          </button>
        }
      >
        <form id="form-tx" onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Kind toggle */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {(['expense', 'income'] as Kind[]).map((k) => {
              const active = kind === k
              const activeColor = k === 'expense' ? 'var(--expense)' : 'var(--income)'
              const activeFg = k === 'expense' ? 'var(--expense-fg)' : 'var(--income-fg)'
              return (
                <button
                  key={k}
                  type="button"
                  onClick={() => { setKind(k); setCategoryId(mostUsedCategoryId(db.transactions, db.categories, k)) }}
                  style={{
                    padding: '10px 16px',
                    borderRadius: 'var(--radius-md)',
                    border: `2px solid ${active ? activeColor : 'var(--border)'}`,
                    background: active ? activeColor : 'transparent',
                    color: active ? activeFg : 'var(--text-2)',
                    fontWeight: 600,
                    fontSize: 14,
                    cursor: 'pointer',
                    transition: 'all 150ms ease-out',
                  }}
                >
                  {k === 'expense' ? 'Pengeluaran' : 'Pemasukan'}
                </button>
              )
            })}
          </div>

          <Field label="Nominal" htmlFor="tx-amt" error={formError}>
            <MoneyInput id="tx-amt" value={amountVal} onValueChange={setAmountVal} autoFocus />
          </Field>

          <Field label="Kategori" htmlFor="tx-cat">
            <select
              id="tx-cat"
              className="input"
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
            >
              <option value="">Tanpa kategori</option>
              {cats.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </Field>

          {db.accounts.length > 0 && (
            <Field label="Rekening" htmlFor="tx-acc">
              <select
                id="tx-acc"
                className="input"
                value={effectiveAccountId}
                onChange={(e) => setAccountId(e.target.value)}
              >
                <option value="">Tidak dipilih</option>
                {db.accounts.map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            </Field>
          )}

          <Field label="Tanggal" htmlFor="tx-dt">
            <input
              id="tx-dt"
              type="date"
              className="input"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </Field>

          <Field label="Catatan" htmlFor="tx-nt">
            <input
              id="tx-nt"
              className="input"
              placeholder="opsional"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </Field>
        </form>
      </Sheet>

      {/* Confirm delete dialog */}
      <ConfirmDialog
        open={deleteTarget !== null}
        title="Hapus Transaksi"
        message="Hapus transaksi ini?"
        onConfirm={() => {
          if (deleteTarget) remove('transactions', deleteTarget.id)
          setDeleteTarget(null)
        }}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  )
}
