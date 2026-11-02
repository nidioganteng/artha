import { useMemo, useState, type FormEvent } from 'react'
import { Plus, ChevronLeft, ChevronRight, Pencil, Trash2 } from 'lucide-react'
import { useStore } from '../lib/store'
import { monthKey, monthLabel, shiftMonth, todayISO } from '../lib/format'
import { formatShort } from '../lib/amount'
import { Sheet, EmptyState, Field, Chip, MoneyInput, ConfirmDialog } from '../ui'
import type { RecurringRule } from '../lib/types'

const KIND_LABEL: Record<RecurringRule['kind'], string> = {
  income: 'Pemasukan',
  expense: 'Pengeluaran',
  invest: 'Investasi (DCA)',
}

export default function Recurring() {
  const { db, save, remove } = useStore()
  const [month, setMonth] = useState(() => monthKey(todayISO()))
  const monthDate = `${month}-01`

  const [open, setOpen] = useState(false)
  const [editRule, setEditRule] = useState<RecurringRule | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<RecurringRule | null>(null)

  // Form state
  const [name, setName] = useState('')
  const [kind, setKind] = useState<RecurringRule['kind']>('expense')
  const [amountVal, setAmountVal] = useState<number | null>(null)
  const [day, setDay] = useState('1')
  const [categoryId, setCategoryId] = useState('')
  const [formError, setFormError] = useState('')

  const rules = useMemo(
    () =>
      db.recurring_rules
        .filter((r) => r.active)
        .sort((a, b) => a.day_of_month - b.day_of_month),
    [db.recurring_rules],
  )

  const cats = db.categories.filter((c) =>
    c.kind === (kind === 'income' ? 'income' : 'expense'),
  )

  const done = useMemo(
    () =>
      rules.filter((r) =>
        db.recurring_checks.some((c) => c.rule_id === r.id && c.month === monthDate),
      ).length,
    [rules, db.recurring_checks, monthDate],
  )

  function dueDate(r: RecurringRule): string {
    const [y, m] = month.split('-').map(Number)
    const last = new Date(y, m, 0).getDate()
    return `${month}-${String(Math.min(r.day_of_month, last)).padStart(2, '0')}`
  }

  function check(r: RecurringRule) {
    let txId: string | null = null
    if (r.kind !== 'invest') {
      txId = save('transactions', {
        kind: r.kind,
        amount: r.amount,
        category_id: r.category_id,
        account_id: r.account_id,
        occurred_on: todayISO(),
        note: r.name,
        recurring_rule_id: r.id,
      })
    }
    save('recurring_checks', {
      rule_id: r.id,
      month: monthDate,
      paid_at: new Date().toISOString(),
      transaction_id: txId,
    })
  }

  function uncheck(r: RecurringRule) {
    const c = db.recurring_checks.find((x) => x.rule_id === r.id && x.month === monthDate)
    if (!c) return
    if (c.transaction_id) remove('transactions', c.transaction_id)
    remove('recurring_checks', c.id)
  }

  function openAdd() {
    setEditRule(null)
    setName('')
    setKind('expense')
    setAmountVal(null)
    setDay('1')
    setCategoryId('')
    setFormError('')
    setOpen(true)
  }

  function openEdit(r: RecurringRule) {
    setEditRule(r)
    setName(r.name)
    setKind(r.kind)
    setAmountVal(r.amount)
    setDay(String(r.day_of_month))
    setCategoryId(r.category_id ?? '')
    setFormError('')
    setOpen(true)
  }

  function submitRule(e: FormEvent) {
    e.preventDefault()
    const d = Number(day)
    if (!name.trim()) return setFormError('Nama wajib diisi.')
    if (amountVal == null || amountVal <= 0) return setFormError('Nominal harus lebih dari 0.')
    if (!Number.isInteger(d) || d < 1 || d > 31) return setFormError('Tanggal harus 1 sampai 31.')
    setFormError('')
    if (editRule) {
      save('recurring_rules', {
        ...editRule,
        name: name.trim(),
        kind,
        amount: amountVal,
        day_of_month: d,
        category_id: kind === 'invest' ? null : categoryId || null,
      })
    } else {
      save('recurring_rules', {
        name: name.trim(),
        kind,
        amount: amountVal,
        day_of_month: d,
        category_id: kind === 'invest' ? null : categoryId || null,
        account_id: db.accounts[0]?.id ?? null,
        active: true,
      })
    }
    setEditRule(null)
    setOpen(false)
  }

  function confirmDelete(r: RecurringRule) {
    db.recurring_checks
      .filter((c) => c.rule_id === r.id)
      .forEach((c) => remove('recurring_checks', c.id))
    remove('recurring_rules', r.id)
    setDeleteTarget(null)
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
          Rutin Bulanan
        </h1>
        <button className="btn" onClick={openAdd} style={{ gap: 6 }}>
          <Plus size={16} />
          Tambah
        </button>
      </div>

      {/* Month nav */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 20,
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
            style={{ border: 'none', borderRadius: 0, minHeight: 40, padding: '0 10px' }}
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
            style={{ border: 'none', borderRadius: 0, minHeight: 40, padding: '0 10px' }}
          >
            <ChevronRight size={16} />
          </button>
        </div>

        {rules.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 24,
                fontWeight: 700,
                color: done === rules.length ? 'var(--income)' : 'var(--text-1)',
              }}
            >
              {done}
            </span>
            <span className="muted">/ {rules.length} selesai</span>
          </div>
        )}
      </div>

      {/* Progress bar */}
      {rules.length > 0 && (
        <div
          style={{
            height: 6,
            borderRadius: 3,
            background: 'var(--surface-2)',
            overflow: 'hidden',
            marginBottom: 20,
            border: '1px solid var(--border)',
          }}
        >
          <div
            style={{
              height: '100%',
              width: `${(done / rules.length) * 100}%`,
              background: done === rules.length ? 'var(--income)' : 'var(--primary)',
              borderRadius: 3,
              transition: 'width 400ms ease-out',
            }}
          />
        </div>
      )}

      {/* Checklist */}
      {rules.length === 0 ? (
        <EmptyState
          title="Belum ada aturan rutin"
          description="Tambahkan gaji, tagihan bulanan, atau DCA yang berulang setiap bulan."
          action={
            <button className="btn" onClick={openAdd}>
              Tambah Aturan
            </button>
          }
        />
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          {rules.map((r, i) => {
            const checked = db.recurring_checks.some(
              (c) => c.rule_id === r.id && c.month === monthDate,
            )
            const due = dueDate(r).slice(8)
            const chipVariant =
              r.kind === 'income' ? 'chip-income' : r.kind === 'invest' ? 'chip-invest' : 'chip-expense'

            return (
              <div
                key={r.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '14px 16px',
                  borderTop: i > 0 ? '1px solid var(--border)' : 'none',
                  transition: 'opacity 150ms ease-out',
                }}
              >
                {/* Checkbox */}
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={checked}
                  aria-label={`Tandai ${r.name}`}
                  onClick={() => (checked ? uncheck(r) : check(r))}
                  style={{
                    width: 24,
                    height: 24,
                    borderRadius: 6,
                    border: `2px solid ${checked ? 'var(--income)' : 'var(--border-input)'}`,
                    background: checked ? 'var(--income)' : 'transparent',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                    cursor: 'pointer',
                    color: checked ? 'var(--income-fg)' : 'transparent',
                    fontSize: 13,
                    fontWeight: 700,
                    transition: 'all 150ms ease-out',
                  }}
                >
                  ✓
                </button>

                {/* Content */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 14,
                      fontWeight: 500,
                      color: checked ? 'var(--text-3)' : 'var(--text-1)',
                      textDecoration: checked ? 'line-through' : 'none',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {r.name}
                  </div>
                  <div className="muted" style={{ fontSize: 12, display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', marginTop: 2 }}>
                    <span className={`chip ${chipVariant}`} style={{ fontSize: 10, padding: '1px 6px' }}>
                      {KIND_LABEL[r.kind]}
                    </span>
                    <span>Tgl {due}</span>
                    {r.kind === 'invest' && !checked && (
                      <span style={{ color: 'var(--invest)' }}>catat di tab Investasi</span>
                    )}
                  </div>
                </div>

                {/* Amount */}
                <div
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontWeight: 600,
                    fontSize: 14,
                    color: checked ? 'var(--text-3)' : 'var(--text-1)',
                    textDecoration: checked ? 'line-through' : 'none',
                    flexShrink: 0,
                    textAlign: 'right' as const,
                  }}
                >
                  {formatShort(r.amount)}
                </div>

                {/* Edit */}
                <button
                  className="btn-ghost"
                  aria-label={`Edit aturan ${r.name}`}
                  onClick={() => openEdit(r)}
                  style={{ padding: 8, minHeight: 44, minWidth: 44, border: 'none', color: 'var(--text-2)' }}
                >
                  <Pencil size={15} />
                </button>

                {/* Delete */}
                <button
                  className="btn-ghost"
                  aria-label={`Hapus aturan ${r.name}`}
                  onClick={() => setDeleteTarget(r)}
                  style={{ padding: 8, minHeight: 44, minWidth: 44, border: 'none', color: 'var(--expense)' }}
                >
                  <Trash2 size={15} />
                </button>
              </div>
            )
          })}
        </div>
      )}

      {/* Add/Edit Rule Sheet */}
      <Sheet
        open={open}
        onClose={() => { setOpen(false); setEditRule(null) }}
        title={editRule ? 'Edit Aturan Rutin' : 'Tambah Aturan Rutin'}
        footer={
          <button type="submit" form="form-rec" className="btn" style={{ width: '100%' }}>
            {editRule ? 'Simpan Perubahan' : 'Tambah'}
          </button>
        }
      >
        <form id="form-rec" onSubmit={submitRule} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Field label="Nama" htmlFor="rec-name">
            <input
              id="rec-name"
              className="input"
              placeholder="Gaji, Listrik, DCA BTC"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </Field>

          <Field label="Jenis" htmlFor="rec-kind">
            <select
              id="rec-kind"
              className="input"
              value={kind}
              onChange={(e) => setKind(e.target.value as RecurringRule['kind'])}
            >
              <option value="expense">Pengeluaran</option>
              <option value="income">Pemasukan</option>
              <option value="invest">Investasi (DCA)</option>
            </select>
          </Field>

          <Field label="Nominal" htmlFor="rec-amt">
            <MoneyInput id="rec-amt" value={amountVal} onValueChange={setAmountVal} placeholder="500.000" />
          </Field>

          <Field label="Tanggal tiap bulan" htmlFor="rec-day">
            <input
              id="rec-day"
              className="input"
              inputMode="numeric"
              placeholder="1"
              value={day}
              onChange={(e) => setDay(e.target.value.replace(/[^\d]/g, '').slice(0, 2))}
            />
          </Field>

          {kind !== 'invest' && (
            <Field label="Kategori" htmlFor="rec-cat">
              <select
                id="rec-cat"
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
          )}

          {formError && (
            <p style={{ fontSize: 13, color: 'var(--expense)', marginTop: -8 }}>{formError}</p>
          )}

        </form>
      </Sheet>

      {/* Confirm delete dialog */}
      <ConfirmDialog
        open={deleteTarget !== null}
        title="Hapus Aturan Rutin"
        message={deleteTarget ? `Hapus aturan "${deleteTarget.name}"? Riwayat bulan ini ikut terhapus.` : undefined}
        onConfirm={() => { if (deleteTarget) confirmDelete(deleteTarget) }}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  )
}
