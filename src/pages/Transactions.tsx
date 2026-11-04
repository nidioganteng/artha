import { useMemo, useState, type FormEvent } from 'react'
import { Plus, ChevronLeft, ChevronRight, Pencil, Trash2 } from 'lucide-react'
import { useStore } from '../lib/store'
import { dateLabel, idr, monthKey, monthLabel, shiftMonth, todayISO } from '../lib/format'
import { Sheet, EmptyState, Field, MoneyInput, ConfirmDialog } from '../ui'
import type { Kind, Transaction } from '../lib/types'

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
  const [month, setMonth] = useState(() => monthKey(todayISO()))
  const [filter, setFilter] = useState<Filter>('all')
  const [open, setOpen] = useState(false)
  const [editTx, setEditTx] = useState<Transaction | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Transaction | null>(null)

  // Form state
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

  const list = useMemo(() => {
    let txs = db.transactions.filter((t) => t.occurred_on.startsWith(month))
    if (filter !== 'all') txs = txs.filter((t) => t.kind === filter)
    return txs.sort((a, b) => b.occurred_on.localeCompare(a.occurred_on))
  }, [db.transactions, month, filter])

  const grouped = useMemo(() => {
    const map = new Map<string, typeof list>()
    for (const tx of list) {
      if (!map.has(tx.occurred_on)) map.set(tx.occurred_on, [])
      map.get(tx.occurred_on)!.push(tx)
    }
    return [...map.entries()].sort((a, b) => b[0].localeCompare(a[0]))
  }, [list])

  const { income, expense } = useMemo(() => {
    const all = db.transactions.filter((t) => t.occurred_on.startsWith(month))
    return {
      income: all.filter((t) => t.kind === 'income').reduce((s, t) => s + t.amount, 0),
      expense: all.filter((t) => t.kind === 'expense').reduce((s, t) => s + t.amount, 0),
    }
  }, [db.transactions, month])

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
      })
    }
    setEditTx(null)
    setOpen(false)
  }

  const isCurrentMonth = month === monthKey(todayISO())

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
          Transaksi
        </h1>
        <button className="btn" onClick={openAdd} style={{ gap: 6 }}>
          <Plus size={16} />
          Tambah
        </button>
      </div>

      {/* Month nav + summary */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 16,
          gap: 12,
          flexWrap: 'wrap',
        }}
      >
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
            className="btn-ghost"
            onClick={() => setMonth((m) => shiftMonth(m, -1))}
            aria-label="Bulan sebelumnya"
            style={{ border: 'none', borderRadius: 0, minHeight: 44, minWidth: 44, padding: '0 12px' }}
          >
            <ChevronLeft size={16} />
          </button>
          <span
            style={{
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
            className="btn-ghost"
            onClick={() => setMonth((m) => shiftMonth(m, 1))}
            disabled={isCurrentMonth}
            aria-label="Bulan berikutnya"
            style={{ border: 'none', borderRadius: 0, minHeight: 44, minWidth: 44, padding: '0 12px' }}
          >
            <ChevronRight size={16} />
          </button>
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <span className="chip chip-income">+{idr(income)}</span>
          <span className="chip chip-expense">-{idr(expense)}</span>
        </div>
      </div>

      {/* Filter pills */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
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

      {/* Transaction list */}
      {list.length === 0 ? (
        <EmptyState
          title="Belum ada transaksi"
          description={`Belum ada ${filter === 'all' ? 'transaksi' : filter === 'expense' ? 'pengeluaran' : 'pemasukan'} di bulan ini.`}
          action={
            <button className="btn" onClick={openAdd}>
              Tambah Transaksi
            </button>
          }
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {grouped.map(([day, txs]) => {
            const dayInc = txs.filter((t) => t.kind === 'income').reduce((s, t) => s + t.amount, 0)
            const dayExp = txs.filter((t) => t.kind === 'expense').reduce((s, t) => s + t.amount, 0)
            return (
            <div key={day}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'baseline',
                  justifyContent: 'space-between',
                  gap: 8,
                  marginBottom: 8,
                  paddingLeft: 4,
                  paddingRight: 4,
                }}
              >
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: 'var(--text-3)',
                    letterSpacing: '0.06em',
                    textTransform: 'uppercase',
                  }}
                >
                  {dateLabel(day)}
                </span>
                <span style={{ display: 'flex', gap: 8, fontFamily: 'var(--font-mono)', fontSize: 12 }}>
                  {dayInc > 0 && (
                    <span style={{ color: 'var(--income)' }}>+{idr(dayInc)}</span>
                  )}
                  {dayExp > 0 && (
                    <span style={{ color: 'var(--expense)' }}>-{idr(dayExp)}</span>
                  )}
                </span>
              </div>
              <div
                className="card"
                style={{ padding: 0, overflow: 'hidden' }}
              >
                {txs.map((tx, i) => {
                  const cat = db.categories.find((c) => c.id === tx.category_id)?.name
                  const acc = db.accounts.find((a) => a.id === tx.account_id)?.name
                  const unsaved = failedIds.has(tx.id)
                  const isIncome = tx.kind === 'income'
                  return (
                    <div
                      key={tx.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        padding: '10px 16px',
                        minHeight: 56,
                        borderTop: i > 0 ? '1px solid var(--border)' : 'none',
                        opacity: unsaved ? 0.6 : 1,
                      }}
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
                          fontWeight: 700,
                          fontSize: 16,
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
                          {tx.note || cat || (isIncome ? 'Pemasukan' : 'Pengeluaran')}
                          {unsaved && (
                            <span
                              style={{ marginLeft: 6, fontSize: 12, color: 'var(--warn)' }}
                            >
                              belum tersimpan
                            </span>
                          )}
                        </div>
                        {(cat || acc) && (
                          <div className="muted" style={{ fontSize: 12 }}>
                            {cat}{acc ? ` · ${acc}` : ''}
                          </div>
                        )}
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
                        {isIncome ? '+' : '-'}{idr(tx.amount)}
                      </div>
                      <button
                        className="btn-ghost"
                        aria-label="Edit transaksi"
                        onClick={() => openEdit(tx)}
                        style={{ padding: 8, minHeight: 44, minWidth: 44, border: 'none', color: 'var(--text-2)' }}
                      >
                        <Pencil size={15} />
                      </button>
                      <button
                        className="btn-ghost"
                        aria-label="Hapus transaksi"
                        onClick={() => setDeleteTarget(tx)}
                        style={{ padding: 8, minHeight: 44, minWidth: 44, border: 'none', color: 'var(--expense)' }}
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  )
                })}
              </div>
            </div>
            )
          })}
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
                    minHeight: 44,
                    fontFamily: 'inherit',
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
