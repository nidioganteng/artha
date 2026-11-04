import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, AlertTriangle } from 'lucide-react'
import { useStore } from '../lib/store'
import { idr, monthKey, monthLabel, shiftMonth, todayISO } from '../lib/format'
import { formatShort } from '../lib/amount'
import { monthReport, unassignedTrades } from '../lib/ledger'

// ──────────────────────────────────────────────────────
// Section wrapper (card)
// ──────────────────────────────────────────────────────
function Card({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className="card" style={{ padding: 20 }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 12,
          gap: 10,
        }}
      >
        <h2 style={{ fontWeight: 600, fontSize: 15, color: 'var(--text-1)' }}>{title}</h2>
        {action}
      </div>
      {children}
    </section>
  )
}

// ──────────────────────────────────────────────────────
// Stat Row — label + nilai dengan token warna
// ──────────────────────────────────────────────────────
function StatRow({
  label,
  value,
  token,
  mono = true,
}: {
  label: string
  value: string
  token?: string
  mono?: boolean
}) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'baseline',
        gap: 10,
        padding: '8px 0',
        borderTop: '1px solid var(--border)',
        minWidth: 0,
      }}
    >
      <span className="muted" style={{ fontSize: 13, minWidth: 0 }}>
        {label}
      </span>
      <span
        style={{
          fontFamily: mono ? 'var(--font-mono)' : 'inherit',
          fontSize: 14,
          fontWeight: 600,
          color: token ?? 'var(--text-1)',
          flexShrink: 0,
          textAlign: 'right',
        }}
      >
        {value}
      </span>
    </div>
  )
}

// ──────────────────────────────────────────────────────
// Horizontal bar per kategori
// ──────────────────────────────────────────────────────
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
          height: 8,
          borderRadius: 4,
          background: 'var(--surface-2)',
          overflow: 'hidden',
          border: '1px solid var(--border)',
        }}
      >
        <div
          style={{
            height: '100%',
            width: `${Math.max(2, pct)}%`,
            background: token,
            borderRadius: 4,
            transition: 'width 300ms ease-out',
          }}
        />
      </div>
    </div>
  )
}

// ──────────────────────────────────────────────────────
// Report page (#lap)
// ──────────────────────────────────────────────────────
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
  const maxCat = Math.max(
    ...report.byCategory.map((c) => c.total),
    1,
  )

  return (
    <div
      data-testid="report-page"
      style={{ display: 'flex', flexDirection: 'column', gap: 0 }}
    >
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
          marginBottom: 20,
        }}
      >
        <button
          onClick={() => goto ? goto('home') : (window.location.hash = 'home')}
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
          Ringkasan
        </button>
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
          Laporan
        </button>
      </div>

      {/* Header + month picker */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 20,
          gap: 12,
          flexWrap: 'wrap',
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
            style={{ border: 'none', borderRadius: 0, minHeight: 44, padding: '0 12px' }}
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
            style={{ border: 'none', borderRadius: 0, minHeight: 44, padding: '0 12px' }}
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
          gap: 16,
        }}
      >
        {/* ── Arus Kas ─────────────────────────────────── */}
        <Card title="Arus Kas">
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <StatRow label="Pemasukan" value={idr(report.income)} token="var(--income)" />
            <StatRow label="Pengeluaran" value={idr(report.expense)} token="var(--expense)" />
            <StatRow label="Investasi (beli)" value={idr(report.investBuy)} token="var(--invest)" />
            <StatRow label="Investasi (jual)" value={idr(report.investSell)} token="var(--income)" />
            <StatRow
              label="Sisa bersih"
              value={idr(report.net)}
              token={report.net >= 0 ? 'var(--income)' : 'var(--expense)'}
            />
          </div>
          <p className="muted" style={{ fontSize: 12, marginTop: 10 }}>
            Sisa bersih = masuk - keluar - beli + jual
          </p>
        </Card>

        {/* ── Per Kategori ─────────────────────────────── */}
        <Card title="Per Kategori">
          {report.byCategory.length === 0 ? (
            <p className="muted" style={{ fontSize: 13 }}>
              Belum ada transaksi bulan ini.
            </p>
          ) : (
            <div style={{ minWidth: 0 }}>
              {incomeCats.length > 0 && (
                <div style={{ marginBottom: 12 }}>
                  <div
                    className="muted"
                    style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}
                  >
                    Pemasukan
                  </div>
                  {incomeCats.map((c) => (
                    <CategoryBar
                      key={`i-${c.categoryId ?? 'none'}`}
                      name={c.name}
                      total={c.total}
                      max={maxCat}
                      kind="income"
                    />
                  ))}
                </div>
              )}
              {expenseCats.length > 0 && (
                <div>
                  <div
                    className="muted"
                    style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}
                  >
                    Pengeluaran
                  </div>
                  {expenseCats.map((c) => (
                    <CategoryBar
                      key={`e-${c.categoryId ?? 'none'}`}
                      name={c.name}
                      total={c.total}
                      max={maxCat}
                      kind="expense"
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </Card>

        {/* ── Saldo Per Rekening ───────────────────────── */}
        <Card title="Saldo Per Rekening">
          {report.accountChanges.length === 0 ? (
            <p className="muted" style={{ fontSize: 13 }}>
              Belum ada rekening. Tambahkan di Pengaturan.
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {report.accountChanges.map((a) => (
                <div
                  key={a.accountId}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr auto',
                    gap: 10,
                    padding: '10px 0',
                    borderTop: '1px solid var(--border)',
                    minWidth: 0,
                  }}
                >
                  <div style={{ minWidth: 0 }}>
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
                      {a.name}
                    </div>
                    <div
                      className="muted"
                      style={{ fontSize: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}
                    >
                      <span>Awal {formatShort(a.opening)}</span>
                      <span
                        style={{
                          color: a.change > 0 ? 'var(--income)' : a.change < 0 ? 'var(--expense)' : 'var(--text-3)',
                        }}
                      >
                        {a.change >= 0 ? '+' : ''}{formatShort(a.change)}
                      </span>
                    </div>
                  </div>
                  <div
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: 14,
                      fontWeight: 600,
                      color: a.closing < 0 ? 'var(--expense)' : 'var(--text-1)',
                      textAlign: 'right',
                      flexShrink: 0,
                    }}
                  >
                    {formatShort(a.closing)}
                  </div>
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
        </Card>

        {/* ── Investasi Bulan Ini ──────────────────────── */}
        <Card title="Investasi Bulan Ini">
          <StatRow label="Total pembelian" value={idr(report.investBuy)} token="var(--invest)" />
          <StatRow label="Total penjualan" value={idr(report.investSell)} token="var(--income)" />
          <StatRow
            label="Arus kas investasi"
            value={idr(report.investSell - report.investBuy)}
            token={report.investSell - report.investBuy >= 0 ? 'var(--income)' : 'var(--expense)'}
          />
        </Card>
      </div>
    </div>
  )
}
