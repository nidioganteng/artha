import { useMemo, useState, type FormEvent } from 'react'
import { Plus, Pencil, Trash2, ArrowRightLeft } from 'lucide-react'
import { useStore } from '../lib/store'
import { dateLabel, idr, todayISO } from '../lib/format'
import { periodRange } from '../lib/calc'
import { loadPeriod, savePeriod, periodSummaryLabel, type DashPeriod } from '../lib/period'
import { Sheet, EmptyState, Field, MoneyInput, ConfirmDialog } from '../ui'
import { PeriodPicker } from '../ui/PeriodPicker'
import type { Kind, Transaction } from '../lib/types'

type FormKind = Kind | 'transfer'

const TX_PERIOD_KEY = 'artha:txPeriod'
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

export default function Transactions() {
  const { db, save, remove, failedIds } = useStore()

  // Default ke bulan ini bila belum pernah disimpan
  const [period, setPeriod] = useState<DashPeriod>(() => {
    const stored = localStorage.getItem(TX_PERIOD_KEY)
    if (!stored) return { kind: 'month', custom: null }
    return loadPeriod(TX_PERIOD_KEY)
  })

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

  const [filter, setFilter] = useState<Filter>('all')

  // Form state
  const [open, setOpen] = useState(false)
  const [editTx, setEditTx] = useState<Transaction | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Transaction | null>(null)
  const [formKind, setFormKind] = useState<FormKind>('expense')
  const kind: Kind = formKind === 'transfer' ? 'expense' : formKind
  const [amountVal, setAmountVal] = useState<number | null>(null)
  const [categoryId, setCategoryId] = useState('')
  const [accountId, setAccountId] = useState(() => db.accounts[0]?.id ?? '')
  const [toAccountId, setToAccountId] = useState(() => db.accounts[1]?.id ?? db.accounts[0]?.id ?? '')
  const effectiveAccountId =
    db.accounts.find((a) => a.id === accountId)?.id ?? db.accounts[0]?.id ?? ''
  const effectiveToAccountId =
    db.accounts.find((a) => a.id === toAccountId)?.id ?? db.accounts[0]?.id ?? ''
  const [date, setDate] = useState(todayISO)
  const [note, setNote] = useState('')
  const [formError, setFormError] = useState('')

  const cats = db.categories.filter((c) => c.kind === kind)

  const periodTx = useMemo(
    () => db.transactions.filter((t) => t.occurred_on >= range.from && t.occurred_on <= range.to),
    [db.transactions, range],
  )

  const list = useMemo(() => {
    let txs = periodTx
    if (filter !== 'all') txs = txs.filter((t) => t.kind === filter)
    return [...txs].sort((a, b) => b.occurred_on.localeCompare(a.occurred_on))
  }, [periodTx, filter])

  const totals = useMemo(
    () => ({
      income: list.filter((t) => t.kind === 'income' && !t.transfer_pair_id).reduce((s, t) => s + t.amount, 0),
      expense: list.filter((t) => t.kind === 'expense' && !t.transfer_pair_id).reduce((s, t) => s + t.amount, 0),
    }),
    [list],
  )

  const periodTotals = useMemo(
    () => ({
      income: periodTx.filter((t) => t.kind === 'income' && !t.transfer_pair_id).reduce((s, t) => s + t.amount, 0),
      expense: periodTx.filter((t) => t.kind === 'expense' && !t.transfer_pair_id).reduce((s, t) => s + t.amount, 0),
    }),
    [periodTx],
  )

  function openAdd() {
    setEditTx(null)
    setFormKind('expense')
    setDate(todayISO())
    setAmountVal(null)
    setNote('')
    setCategoryId(mostUsedCategoryId(db.transactions, db.categories, 'expense'))
    setAccountId(db.accounts[0]?.id ?? '')
    setToAccountId(db.accounts[1]?.id ?? db.accounts[0]?.id ?? '')
    setFormError('')
    setOpen(true)
  }

  function openEdit(tx: Transaction) {
    setEditTx(tx)
    setFormKind(tx.transfer_pair_id ? 'transfer' : tx.kind)
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
    if (formKind === 'transfer' && effectiveAccountId === effectiveToAccountId) {
      setFormError('Rekening asal dan tujuan tidak boleh sama.')
      return
    }
    setFormError('')

    if (formKind === 'transfer') {
      if (editTx) {
        // Edit sisi keluar dari transfer
        const pairId = editTx.transfer_pair_id ?? editTx.id
        save('transactions', { ...editTx, amount: amountVal, account_id: effectiveAccountId || null, occurred_on: date, note: note.trim() || null })
        // Perbarui sisi masuk jika ada
        const pairTx = db.transactions.find((t) => t.id !== editTx.id && t.transfer_pair_id === pairId)
        if (pairTx) {
          save('transactions', { ...pairTx, amount: amountVal, account_id: effectiveToAccountId || null, occurred_on: date, note: note.trim() || null })
        }
      } else {
        const pairId = crypto.randomUUID()
        save('transactions', {
          kind: 'expense',
          amount: amountVal,
          category_id: null,
          account_id: effectiveAccountId || null,
          occurred_on: date,
          note: note.trim() || `Transfer ke ${db.accounts.find((a) => a.id === effectiveToAccountId)?.name ?? ''}`,
          recurring_rule_id: null,
          trade_id: null,
          transfer_pair_id: pairId,
        })
        save('transactions', {
          kind: 'income',
          amount: amountVal,
          category_id: null,
          account_id: effectiveToAccountId || null,
          occurred_on: date,
          note: note.trim() || `Transfer dari ${db.accounts.find((a) => a.id === effectiveAccountId)?.name ?? ''}`,
          recurring_rule_id: null,
          trade_id: null,
          transfer_pair_id: pairId,
        })
      }
    } else if (editTx) {
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
        transfer_pair_id: null,
      })
    }
    setEditTx(null)
    setOpen(false)
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const thStyle: React.CSSProperties = {
    padding: '9px 14px',
    fontSize: 11,
    fontWeight: 600,
    color: 'var(--text-3)',
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    textAlign: 'left',
    whiteSpace: 'nowrap',
    background: 'transparent',
    borderBottom: '1px solid var(--border)',
  }

  const tdBase: React.CSSProperties = {
    padding: '11px 14px',
    fontSize: 13,
    color: 'var(--text-1)',
    borderBottom: '1px solid var(--border)',
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

      {/* Chips + filter segmented control */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginTop: 12,
          marginBottom: 16,
          gap: 8,
          flexWrap: 'wrap',
        }}
      >
        <div style={{ display: 'flex', gap: 8 }}>
          <span className="chip chip-income">+{idr(periodTotals.income)}</span>
          <span className="chip chip-expense">-{idr(periodTotals.expense)}</span>
        </div>

        <div
          role="radiogroup"
          aria-label="Filter transaksi"
          style={{
            display: 'flex',
            gap: 2,
            background: 'var(--surface-2)',
            borderRadius: 'var(--radius-sm)',
            padding: 3,
          }}
        >
          {(['all', 'expense', 'income'] as Filter[]).map((k) => {
            const active = filter === k
            return (
              <button
                key={k}
                role="radio"
                aria-checked={active}
                onClick={() => setFilter(k)}
                style={{
                  padding: '10px 14px',
                  borderRadius: 'var(--radius-xs)',
                  border: 'none',
                  background: active ? 'var(--surface)' : 'transparent',
                  color: active ? 'var(--text-1)' : 'var(--text-2)',
                  fontSize: 12,
                  fontWeight: active ? 600 : 400,
                  cursor: 'pointer',
                  minHeight: 44,
                  fontFamily: 'inherit',
                  boxShadow: active ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                  transition: 'background 100ms ease-out, color 100ms ease-out',
                  whiteSpace: 'nowrap',
                }}
              >
                {k === 'all' ? 'Semua' : k === 'expense' ? 'Keluar' : 'Masuk'}
              </button>
            )
          })}
        </div>
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
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table
              style={{
                width: '100%',
                minWidth: 540,
                borderCollapse: 'collapse',
              }}
            >
              <thead>
                <tr>
                  <th style={{ ...thStyle, minWidth: 76 }}>Tanggal</th>
                  <th style={{ ...thStyle, minWidth: 140, width: '28%' }}>Catatan</th>
                  <th style={{ ...thStyle, minWidth: 90 }}>Kategori</th>
                  <th style={{ ...thStyle, minWidth: 90 }}>Rekening</th>
                  <th style={{ ...thStyle, minWidth: 100, textAlign: 'right' }}>Masuk</th>
                  <th style={{ ...thStyle, minWidth: 100, textAlign: 'right' }}>Keluar</th>
                  <th style={{ ...thStyle, width: 80 }} aria-label="Aksi" />
                </tr>
              </thead>
              <tbody>
                {list.map((tx) => {
                  const cat = db.categories.find((c) => c.id === tx.category_id)
                  const acc = db.accounts.find((a) => a.id === tx.account_id)?.name
                  const unsaved = failedIds.has(tx.id)
                  const isIncome = tx.kind === 'income'
                  const isLinkedTrade = tx.trade_id != null
                  const isTransfer = tx.transfer_pair_id != null
                  // Sembunyikan sisi masuk transfer (sudah tampil dari sisi keluar)
                  if (isTransfer && isIncome) return null

                  return (
                    <tr key={tx.id} style={{ opacity: unsaved ? 0.6 : 1 }}>
                      {/* Tanggal */}
                      <td
                        style={{
                          ...tdBase,
                          fontSize: 12,
                          color: 'var(--text-3)',
                          fontFamily: 'var(--font-mono)',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {dateLabel(tx.occurred_on)}
                      </td>

                      {/* Catatan */}
                      <td style={{ ...tdBase, maxWidth: 200 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span
                            style={{
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                              fontWeight: 600,
                              fontSize: 13,
                            }}
                          >
                            {tx.note || (isTransfer ? 'Transfer' : isIncome ? 'Pemasukan' : 'Pengeluaran')}
                          </span>
                          {isTransfer && (
                            <span
                              className="chip"
                              style={{ fontSize: 11, padding: '1px 6px', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 3 }}
                            >
                              <ArrowRightLeft size={10} />Transfer
                            </span>
                          )}
                          {isLinkedTrade && (
                            <span
                              className="chip"
                              style={{ fontSize: 11, padding: '1px 6px', flexShrink: 0 }}
                            >
                              Investasi
                            </span>
                          )}
                          {unsaved && (
                            <span
                              style={{ fontSize: 11, color: 'var(--warn)', flexShrink: 0 }}
                              title="Belum tersimpan"
                            >
                              •
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Kategori */}
                      <td style={tdBase}>
                        {cat ? (
                          <span
                            className="chip"
                            style={{ fontSize: 11, padding: '2px 8px', display: 'inline-block' }}
                          >
                            {cat.name}
                          </span>
                        ) : (
                          <span style={{ color: 'var(--text-3)' }}>-</span>
                        )}
                      </td>

                      {/* Rekening */}
                      <td
                        style={{
                          ...tdBase,
                          fontSize: 12,
                          color: 'var(--text-2)',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {acc ?? <span style={{ color: 'var(--text-3)' }}>-</span>}
                      </td>

                      {/* Masuk */}
                      <td
                        style={{
                          ...tdBase,
                          textAlign: 'right',
                          fontFamily: 'var(--font-mono)',
                          fontWeight: 700,
                          fontSize: 14,
                          color: isIncome ? 'var(--income)' : 'var(--text-3)',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {isIncome ? idr(tx.amount) : ''}
                      </td>

                      {/* Keluar */}
                      <td
                        style={{
                          ...tdBase,
                          textAlign: 'right',
                          fontFamily: 'var(--font-mono)',
                          fontWeight: 700,
                          fontSize: 14,
                          color: !isIncome ? 'var(--expense)' : 'var(--text-3)',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {!isIncome ? idr(tx.amount) : ''}
                      </td>

                      {/* Aksi */}
                      <td style={{ ...tdBase, padding: '0 6px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                        {!isLinkedTrade && (
                          <>
                            <button
                              className="btn-ghost"
                              aria-label="Edit transaksi"
                              onClick={() => openEdit(tx)}
                              style={{ padding: 8, minHeight: 44, minWidth: 44, border: 'none', color: 'var(--text-2)' }}
                            >
                              <Pencil size={14} />
                            </button>
                            <button
                              className="btn-ghost"
                              aria-label="Hapus transaksi"
                              onClick={() => setDeleteTarget(tx)}
                              style={{ padding: 8, minHeight: 44, minWidth: 44, border: 'none', color: 'var(--expense)' }}
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

              {/* Total */}
              <tfoot>
                <tr style={{ background: 'var(--surface-2)' }}>
                  <td
                    colSpan={4}
                    style={{
                      ...tdBase,
                      fontWeight: 700,
                      fontSize: 11,
                      letterSpacing: '0.06em',
                      textTransform: 'uppercase',
                      color: 'var(--text-2)',
                      borderTop: '2px solid var(--border)',
                      borderBottom: 'none',
                    }}
                  >
                    Total
                  </td>
                  <td
                    style={{
                      ...tdBase,
                      textAlign: 'right',
                      fontFamily: 'var(--font-mono)',
                      fontWeight: 700,
                      fontSize: 15,
                      color: totals.income > 0 ? 'var(--income)' : 'var(--text-3)',
                      whiteSpace: 'nowrap',
                      borderTop: '2px solid var(--border)',
                      borderBottom: 'none',
                    }}
                  >
                    {totals.income > 0 ? idr(totals.income) : '-'}
                  </td>
                  <td
                    style={{
                      ...tdBase,
                      textAlign: 'right',
                      fontFamily: 'var(--font-mono)',
                      fontWeight: 700,
                      fontSize: 15,
                      color: totals.expense > 0 ? 'var(--expense)' : 'var(--text-3)',
                      whiteSpace: 'nowrap',
                      borderTop: '2px solid var(--border)',
                      borderBottom: 'none',
                    }}
                  >
                    {totals.expense > 0 ? idr(totals.expense) : '-'}
                  </td>
                  <td
                    style={{
                      ...tdBase,
                      borderTop: '2px solid var(--border)',
                      borderBottom: 'none',
                    }}
                  />
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* Tambah/Edit Sheet */}
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
          {/* Jenis: Pengeluaran / Pemasukan / Transfer */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
            {([
              { k: 'expense' as FormKind, label: 'Keluar', color: 'var(--expense)', fg: 'var(--expense-fg)' },
              { k: 'income' as FormKind, label: 'Masuk', color: 'var(--income)', fg: 'var(--income-fg)' },
              { k: 'transfer' as FormKind, label: 'Transfer', color: 'var(--invest)', fg: 'var(--invest-fg)' },
            ]).map(({ k, label, color, fg }) => {
              const active = formKind === k
              return (
                <button
                  key={k}
                  type="button"
                  disabled={!!editTx && k === 'transfer' && !editTx.transfer_pair_id}
                  onClick={() => {
                    setFormKind(k)
                    if (k !== 'transfer') setCategoryId(mostUsedCategoryId(db.transactions, db.categories, k as Kind))
                  }}
                  style={{
                    padding: '10px 8px',
                    borderRadius: 'var(--radius-md)',
                    border: `2px solid ${active ? color : 'var(--border)'}`,
                    background: active ? color : 'transparent',
                    color: active ? fg : 'var(--text-2)',
                    fontWeight: 600,
                    fontSize: 13,
                    cursor: 'pointer',
                    transition: 'all 150ms ease-out',
                  }}
                >
                  {label}
                </button>
              )
            })}
          </div>

          <Field label="Nominal" htmlFor="tx-amt" error={formError}>
            <MoneyInput id="tx-amt" value={amountVal} onValueChange={setAmountVal} autoFocus />
          </Field>

          {formKind === 'transfer' ? (
            <>
              <Field label="Dari rekening" htmlFor="tx-from">
                <select id="tx-from" className="input" value={effectiveAccountId} onChange={(e) => setAccountId(e.target.value)}>
                  {db.accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </Field>
              <Field label="Ke rekening" htmlFor="tx-to">
                <select id="tx-to" className="input" value={effectiveToAccountId} onChange={(e) => setToAccountId(e.target.value)}>
                  {db.accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </Field>
            </>
          ) : (
            <>
              <Field label="Kategori" htmlFor="tx-cat">
                <select id="tx-cat" className="input" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
                  <option value="">Tanpa kategori</option>
                  {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </Field>
              {db.accounts.length > 0 && (
                <Field label="Rekening" htmlFor="tx-acc">
                  <select id="tx-acc" className="input" value={effectiveAccountId} onChange={(e) => setAccountId(e.target.value)}>
                    <option value="">Tidak dipilih</option>
                    {db.accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                </Field>
              )}
            </>
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

      <ConfirmDialog
        open={deleteTarget !== null}
        title="Hapus Transaksi"
        message={deleteTarget?.transfer_pair_id ? 'Hapus transfer ini? Kedua sisi (keluar dan masuk) akan dihapus.' : 'Hapus transaksi ini?'}
        onConfirm={() => {
          if (deleteTarget) {
            if (deleteTarget.transfer_pair_id) {
              // Hapus kedua sisi transfer
              const pairId = deleteTarget.transfer_pair_id
              db.transactions
                .filter((t) => t.transfer_pair_id === pairId)
                .forEach((t) => remove('transactions', t.id))
            } else {
              remove('transactions', deleteTarget.id)
            }
          }
          setDeleteTarget(null)
        }}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  )
}
