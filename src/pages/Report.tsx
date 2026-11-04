import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, AlertTriangle } from 'lucide-react'
import { useStore } from '../lib/store'
import { idr, monthKey, monthLabel, shiftMonth, todayISO } from '../lib/format'
import { formatShort } from '../lib/amount'
import { monthReport, unassignedTrades } from '../lib/ledger'

function StatBox({
  label,
  value,
  token,
}: {
  label: string
  value: string
  token: string
}) {
  return (
    <div
      className="card"
      style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 4 }}
    >
      <span className="muted" style={{ fontSize: 12 }}>{label}</span>
      <span
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 15,
          fontWeight: 700,
          color: token,
          letterSpacing: '-0.01em',
        }}
      >
        {value}
      </span>
    </div>
  )
}

function CategoryBar({
  name,
  total,
  max,
  kind,
}: {
  name: string
  total: number
  max: number
  kind: 'income' | 'expense'
}) {
  const pct = max > 0 ? (total / max) * 100 : 0
  const token = kind === 'income' ? 'var(--income)' : 'var(--expense)'
  return (
    <div style={{ marginBottom: 10, minWidth: 0 }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          gap: 10,
          fontSize: 13,
          marginBottom: 4,
          minWidth: 0,
        }}
      >
        <span
          style={{
            color: 'var(--text-1)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            minWidth: 0,
            flex: 1,
          }}
        >
          {name}
        </span>
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontWeight: 600,
            color: token,
            flexShrink: 0,
          }}
          aria-label={idr(total)}
        >
          {formatShort(total)}
        </span>
      </div>
      <div
        style={{
          height: 6,
          borderRadius: 3,
          background: 'var(--surface-2)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            height: '100%',
            width: `${Math.max(2, pct)}%`,
            background: token,
            borderRadius: 3,
            transition: 'width 300ms ease-out',
          }}
        />
      </div>
    </div>
  )
}

export default function Report({ goto }: { goto?: (tab: string) => void }) {
  const { db } = useStore()
  const [month, setMonth] = useState(() => monthKey(todayISO()))

  const report = useMemo(
    () => monthReport(month, db.accounts, db.categories, db.transactions, db.trades),
    [month, db.accounts, db.categories, db.transactions, db.trades],
  )

  const unassigned = useMemo(() => unassignedTrades(db.trades), [db.trades])

  const isCurrentMonth = month === monthKey(todayISO())

  const incomeCats = report.byCategory.filter((c) => c.kind === 'income')
  const expenseCats = report.byCategory.filter((c) => c.kind === 'expense')
  const maxCat = Math.max(...report.byCategory.map((c) => c.total), 1)

  return (
    <div data-testid="report-page" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <h1 style={{ fontWeight: 700, fontSize: 22, color: 'var(--text-1)', letterSpacing: '-0.02em' }}>
          Laporan
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
            style={{ border: 'none', borderRadius: 0, minHeight: 44, minWidth: 44, padding: '0 10px' }}
          >
            <ChevronLeft size={16} />
          </button>
          <span
            style={{
              padding: '0 4px',
              fontSize: 13,
              fontWeight: 500,
              minWidth: 108,
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
            style={{ border: 'none', borderRadius: 0, minHeight: 44, minWidth: 44, padding: '0 10px' }}
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      {/* Stat boxes — 2×2 mobile, 4×1 desktop */}
      <div className="grid grid-cols-2 md:grid-cols-4" style={{ gap: 10 }}>
        <StatBox label="Pemasukan" value={idr(report.income)} token="var(--income)" />
        <StatBox label="Pengeluaran" value={idr(report.expense)} token="var(--expense)" />
        <StatBox
          label="Sisa Bersih"
          value={idr(report.net)}
          token={report.net >= 0 ? 'var(--income)' : 'var(--expense)'}
        />
        <StatBox label="Investasi" value={idr(report.investBuy)} token="var(--invest)" />
      </div>

      {/* Per Kategori */}
      <section className="card" style={{ padding: 20 }}>
        <h2 style={{ fontWeight: 600, fontSize: 15, color: 'var(--text-1)', marginBottom: 16 }}>
          Per Kategori
        </h2>
        {report.byCategory.length === 0 ? (
          <p className="muted" style={{ fontSize: 13 }}>Belum ada transaksi bulan ini.</p>
        ) : (
          <div className="grid md:grid-cols-2" style={{ gap: 20 }}>
            {incomeCats.length > 0 && (
              <div>
                <div className="muted" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
                  Pemasukan
                </div>
                {incomeCats.map((c) => (
                  <CategoryBar key={`i-${c.categoryId ?? 'none'}`} name={c.name} total={c.total} max={maxCat} kind="income" />
                ))}
              </div>
            )}
            {expenseCats.length > 0 && (
              <div>
                <div className="muted" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
                  Pengeluaran
                </div>
                {expenseCats.map((c) => (
                  <CategoryBar key={`e-${c.categoryId ?? 'none'}`} name={c.name} total={c.total} max={maxCat} kind="expense" />
                ))}
              </div>
            )}
          </div>
        )}
      </section>

      {/* Saldo Per Rekening */}
      <section className="card" style={{ padding: 20 }}>
        <h2 style={{ fontWeight: 600, fontSize: 15, color: 'var(--text-1)', marginBottom: 4 }}>
          Saldo Per Rekening
        </h2>
        {report.accountChanges.length === 0 ? (
          <p className="muted" style={{ fontSize: 13, marginTop: 12 }}>
            Belum ada rekening. Tambahkan di Pengaturan.
          </p>
        ) : (
          <div>
            {report.accountChanges.map((a) => (
              <div
                key={a.accountId}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: 12,
                  padding: '12px 0',
                  borderBottom: '1px solid var(--border)',
                  minWidth: 0,
                }}
              >
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {a.name}
                  </div>
                  <div className="muted" style={{ fontSize: 12, display: 'flex', gap: 6, marginTop: 2 }}>
                    <span>{formatShort(a.opening)}</span>
                    <span
                      style={{
                        color: a.change > 0 ? 'var(--income)' : a.change < 0 ? 'var(--expense)' : 'var(--text-3)',
                      }}
                    >
                      {a.change >= 0 ? '+' : ''}{formatShort(a.change)}
                    </span>
                  </div>
                </div>
                <span
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 15,
                    fontWeight: 700,
                    color: a.closing < 0 ? 'var(--expense)' : 'var(--text-1)',
                    flexShrink: 0,
                  }}
                >
                  {formatShort(a.closing)}
                </span>
              </div>
            ))}
          </div>
        )}
        {unassigned.trades.length > 0 && (
          <div
            className="chip chip-warn"
            role="status"
            style={{
              marginTop: 12,
              display: 'flex',
              alignItems: 'flex-start',
              gap: 6,
              whiteSpace: 'normal',
              borderRadius: 'var(--radius-md)',
              lineHeight: 1.5,
              width: '100%',
            }}
          >
            <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 2 }} />
            <span>
              {unassigned.trades.length} catatan investasi tidak terhitung ke rekening ({formatShort(unassigned.totalValue)})
            </span>
          </div>
        )}
      </section>
    </div>
  )
}
