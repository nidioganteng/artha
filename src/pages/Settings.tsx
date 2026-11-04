import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { Sun, Moon, Pencil, LayoutDashboard, TrendingUp, Lock, Unlock } from 'lucide-react'
import { useStore } from '../lib/store'
import { useTheme } from '../lib/theme'
import { useMode } from '../lib/useMode'
import type { FailedOp } from '../lib/store'
import type { Account, Asset, Budget, Contributor, Kind, TableName } from '../lib/types'
import type { Palette } from '../lib/theme'
import { Sheet, Field, MoneyInput, ConfirmDialog } from '../ui'
import { accountBalance } from '../lib/ledger'
import { idr } from '../lib/format'
import { formatShort } from '../lib/amount'

const TABLE_LABEL: Record<TableName, string> = {
  accounts: 'Rekening',
  categories: 'Kategori',
  platforms: 'Platform',
  assets: 'Aset',
  transactions: 'Transaksi',
  trades: 'Catatan investasi',
  recurring_rules: 'Aturan rutin',
  recurring_checks: 'Centang rutin',
  price_snapshots: 'Snapshot harga',
  profiles: 'Profil akun',
  contributors: 'Kontributor',
  budgets: 'Budget',
}

const INDODAX_PAIRS: { pair: string; label: string }[] = [
  { pair: 'btcidr',   label: 'Bitcoin (BTC)' },
  { pair: 'ethidr',   label: 'Ethereum (ETH)' },
  { pair: 'bnbidr',   label: 'BNB' },
  { pair: 'solidr',   label: 'Solana (SOL)' },
  { pair: 'xrpidr',   label: 'Ripple (XRP)' },
  { pair: 'dogeidr',  label: 'Dogecoin (DOGE)' },
  { pair: 'adaidr',   label: 'Cardano (ADA)' },
  { pair: 'matidr',   label: 'Polygon (MATIC)' },
  { pair: 'linkidr',  label: 'Chainlink (LINK)' },
  { pair: 'avaxidr',  label: 'Avalanche (AVAX)' },
  { pair: 'ltcidr',   label: 'Litecoin (LTC)' },
  { pair: 'trxidr',   label: 'Tron (TRX)' },
  { pair: 'dotididr', label: 'Polkadot (DOT)' },
  { pair: 'uniidxidr', label: 'Uniswap (UNI)' },
  { pair: '__custom__', label: 'Lainnya (ketik manual)...' },
]
const KNOWN_PAIRS = new Set(INDODAX_PAIRS.filter((p) => p.pair !== '__custom__').map((p) => p.pair))

function opLabel(f: FailedOp): string {
  if (f.blocked) return `Diblokir: ${TABLE_LABEL[f.table]}`
  const verb = f.op === 'upsert' ? 'Simpan' : 'Hapus'
  const table = TABLE_LABEL[f.table]
  if (f.op === 'upsert') {
    const name = (f.row.name ?? f.row.symbol) as string | undefined
    if (name) return `${verb} ${table}: ${name}`
  }
  return `${verb} ${table}`
}

function downloadCSV(name: string, rows: (string | number | null)[][]) {
  const esc = (v: string | number | null) => {
    const s = v == null ? '' : String(v)
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const blob = new Blob(
    ['﻿' + rows.map((r) => r.map(esc).join(',')).join('\n')],
    { type: 'text/csv;charset=utf-8' },
  )
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = name
  a.click()
  URL.revokeObjectURL(a.href)
}

export default function Settings({ onLogout, focusFailed }: { onLogout: () => void; focusFailed?: boolean }) {
  const { db, save, remove, refresh, pending, failed, failedOps, retryFailed, discardFailed } = useStore()
  const { mode, setMode, palette, setPalette } = useTheme()
  const { mode: accountMode, modeLocked, setMode: setAccountMode, setModeLocked } = useMode()
  const failedRef = useRef<HTMLElement>(null)

  const [pendingMode, setPendingMode] = useState<'lengkap' | 'investasi' | null>(null)
  const [confirmUnlock, setConfirmUnlock] = useState(false)

  useEffect(() => {
    if (focusFailed && failedOps.length > 0) {
      failedRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [focusFailed, failedOps.length])

  const [catName, setCatName] = useState('')
  const [catKind, setCatKind] = useState<Kind>('expense')
  const [accName, setAccName] = useState('')
  const [accType, setAccType] = useState<'cash' | 'bank' | 'ewallet'>('bank')
  const [platName, setPlatName] = useState('')

  const [editingAcc, setEditingAcc] = useState<Account | null>(null)
  const [editAccName, setEditAccName] = useState('')
  const [editAccType, setEditAccType] = useState<'cash' | 'bank' | 'ewallet'>('bank')
  const [editAccOpening, setEditAccOpening] = useState<number | null>(0)
  const [editAccError, setEditAccError] = useState<string | null>(null)

  const [confirmAcc, setConfirmAcc] = useState<{ id: string; name: string } | null>(null)
  const [blockedAcc, setBlockedAcc] = useState<{ name: string; message: string } | null>(null)
  const [confirmDel, setConfirmDel] = useState<{ table: 'categories' | 'platforms' | 'assets'; id: string; label: string } | null>(null)
  const [blockedAsset, setBlockedAsset] = useState<{ name: string; message: string } | null>(null)

  const [contribName, setContribName] = useState('')
  const [contribNameError, setContribNameError] = useState<string | null>(null)
  const [editingContrib, setEditingContrib] = useState<Contributor | null>(null)
  const [editContribName, setEditContribName] = useState('')
  const [editContribError, setEditContribError] = useState<string | null>(null)
  const [confirmDelContrib, setConfirmDelContrib] = useState<{ id: string; name: string; tradeCount: number } | null>(null)
  const [editingBudgetId, setEditingBudgetId] = useState<string | null>(null)
  const [editBudgetVal, setEditBudgetVal] = useState<number | null>(null)

  const [indodaxCustom, setIndodaxCustom] = useState(false)

  const [asset, setAsset] = useState({
    symbol: '', name: '',
    asset_type: 'crypto' as Asset['asset_type'],
    unit: '',
    price_source: 'manual' as Asset['price_source'],
    price_ref: '',
  })

  const currentBalances = useMemo(() => {
    const map = new Map<string, number>()
    for (const a of db.accounts) map.set(a.id, accountBalance(a, db.transactions, db.trades))
    return map
  }, [db.accounts, db.transactions, db.trades])

  function openEditAcc(a: Account) {
    setEditingAcc(a); setEditAccName(a.name)
    setEditAccType((a.type ?? 'bank') as 'cash' | 'bank' | 'ewallet')
    setEditAccOpening(a.opening_balance ?? 0); setEditAccError(null)
  }
  function closeEditAcc() { setEditingAcc(null); setEditAccError(null) }
  function submitEditAcc(e: FormEvent) {
    e.preventDefault()
    if (!editingAcc) return
    if (!editAccName.trim()) { setEditAccError('Nama rekening wajib diisi.'); return }
    save('accounts', { ...editingAcc, name: editAccName.trim(), type: editAccType, opening_balance: editAccOpening ?? 0 })
    closeEditAcc()
  }
  function tryDeleteAcc(a: Account) {
    const txCount = db.transactions.filter((t) => t.account_id === a.id).length
    const trCount = db.trades.filter((t) => t.account_id === a.id).length
    const rrCount = db.recurring_rules.filter((r) => r.account_id === a.id).length
    if (txCount > 0 || trCount > 0 || rrCount > 0) {
      const parts: string[] = []
      if (txCount > 0) parts.push(`${txCount} catatan transaksi`)
      if (trCount > 0) parts.push(`${trCount} catatan investasi`)
      if (rrCount > 0) parts.push(`${rrCount} aturan rutin`)
      setBlockedAcc({ name: a.name, message: `Rekening ini masih dipakai di ${parts.join(' dan ')}. Pindahkan atau hapus referensinya dulu.` })
      return
    }
    setConfirmAcc({ id: a.id, name: a.name })
  }
  function confirmDeleteAcc() { if (!confirmAcc) return; remove('accounts', confirmAcc.id); setConfirmAcc(null) }

  function addCat(e: FormEvent) { e.preventDefault(); if (!catName.trim()) return; save('categories', { name: catName.trim(), kind: catKind }); setCatName('') }
  function addAcc(e: FormEvent) { e.preventDefault(); if (!accName.trim()) return; save('accounts', { name: accName.trim(), type: accType, opening_balance: 0 }); setAccName('') }
  function addPlat(e: FormEvent) { e.preventDefault(); if (!platName.trim()) return; save('platforms', { name: platName.trim() }); setPlatName('') }
  function addAsset(e: FormEvent) {
    e.preventDefault()
    if (!asset.symbol.trim() || !asset.name.trim()) return
    save('assets', {
      symbol: asset.symbol.trim().toUpperCase(), name: asset.name.trim(),
      asset_type: asset.asset_type, unit: asset.unit.trim() || 'unit',
      price_source: asset.price_source,
      price_ref: asset.price_source === 'indodax' ? asset.price_ref.trim().toLowerCase() || null : null,
      manual_price: null, manual_price_at: null,
    })
    setAsset({ ...asset, symbol: '', name: '', unit: '', price_ref: '' })
  }
  function del(table: 'categories' | 'platforms' | 'assets', id: string, label: string) {
    if (table === 'assets' && db.trades.some((t) => t.asset_id === id)) {
      setBlockedAsset({ name: label, message: 'Aset ini masih punya catatan pembelian/penjualan. Hapus catatannya dulu di tab Investasi.' })
      return
    }
    setConfirmDel({ table, id, label })
  }
  function addContrib(e: FormEvent) {
    e.preventDefault()
    const trimmed = contribName.trim()
    if (!trimmed) return
    if (db.contributors.some((c) => c.name.toLowerCase() === trimmed.toLowerCase())) { setContribNameError('Nama sudah dipakai.'); return }
    save('contributors', { name: trimmed, sort_order: db.contributors.length })
    setContribName(''); setContribNameError(null)
  }
  function openEditContrib(c: Contributor) { setEditingContrib(c); setEditContribName(c.name); setEditContribError(null) }
  function closeEditContrib() { setEditingContrib(null); setEditContribError(null) }
  function submitEditContrib(e: FormEvent) {
    e.preventDefault()
    if (!editingContrib) return
    const trimmed = editContribName.trim()
    if (!trimmed) { setEditContribError('Nama wajib diisi.'); return }
    if (db.contributors.some((c) => c.id !== editingContrib.id && c.name.toLowerCase() === trimmed.toLowerCase())) { setEditContribError('Nama sudah dipakai kontributor lain.'); return }
    save('contributors', { ...editingContrib, name: trimmed })
    closeEditContrib()
  }
  function tryDeleteContrib(c: Contributor) {
    setConfirmDelContrib({ id: c.id, name: c.name, tradeCount: db.trades.filter((t) => t.contributor_id === c.id).length })
  }
  function confirmDeleteContrib() {
    if (!confirmDelContrib) return
    for (const trade of db.trades) {
      if (trade.contributor_id === confirmDelContrib.id) save('trades', { ...(trade as unknown as Record<string, unknown>), contributor_id: null })
    }
    remove('contributors', confirmDelContrib.id); setConfirmDelContrib(null)
  }

  function openEditBudget(catId: string, currentAmount: number | undefined) {
    setEditingBudgetId(catId)
    setEditBudgetVal(currentAmount ?? null)
  }
  function closeBudgetEdit() { setEditingBudgetId(null); setEditBudgetVal(null) }
  function saveBudget(catId: string) {
    const existing = db.budgets.find((b: Budget) => b.category_id === catId)
    if (editBudgetVal && editBudgetVal > 0) {
      if (existing) {
        save('budgets', { ...existing as unknown as Record<string, unknown>, amount: editBudgetVal })
      } else {
        save('budgets', { category_id: catId, amount: editBudgetVal })
      }
    } else if (existing) {
      remove('budgets', existing.id)
    }
    closeBudgetEdit()
  }

  const effectiveMode = mode === 'system' ? 'light' : mode

  const paletteOptions: { value: Palette; label: string; desc: string }[] = [
    { value: 'a', label: 'Lime & Hutan', desc: 'Hijau modern' },
    { value: 'b', label: 'Sage & Greige', desc: 'Hangat natural' },
  ]

  // ── Shared style helpers ────────────────────────────
  const divider = { borderTop: '1px solid var(--border)', paddingTop: 16, marginTop: 16 } as const

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <h1 style={{ fontWeight: 700, fontSize: 22, color: 'var(--text-1)', letterSpacing: '-0.02em' }}>
        Pengaturan
      </h1>

      {/* ── Baris atas: Tampilan + Mode Akun ──────────── */}
      <div className="grid md:grid-cols-2" style={{ gap: 16 }}>

        {/* Tampilan */}
        <div className="card" style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 20 }}>
          <h2 style={{ fontWeight: 600, fontSize: 15, color: 'var(--text-1)' }}>Tampilan</h2>

          {/* Tema: 2 ikon bulat */}
          <div>
            <div className="muted" style={{ fontSize: 12, marginBottom: 10 }}>Tema</div>
            <div style={{ display: 'flex', gap: 10 }}>
              {([
                { value: 'light' as const, Icon: Sun, label: 'Terang' },
                { value: 'dark' as const, Icon: Moon, label: 'Gelap' },
              ]).map(({ value, Icon, label }) => {
                const active = effectiveMode === value
                return (
                  <button
                    key={value}
                    onClick={() => setMode(value)}
                    aria-pressed={active}
                    aria-label={label}
                    title={label}
                    style={{
                      width: 52, height: 52,
                      borderRadius: 'var(--radius-md)',
                      border: `2px solid ${active ? 'var(--primary)' : 'var(--border)'}`,
                      background: active ? 'var(--primary)' : 'var(--surface-2)',
                      color: active ? 'var(--primary-fg)' : 'var(--text-2)',
                      cursor: 'pointer',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 4,
                      transition: 'all 150ms ease-out',
                    }}
                  >
                    <Icon size={18} />
                    <span style={{ fontSize: 11, fontWeight: 500, fontFamily: 'inherit' }}>{label}</span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Palet */}
          <div>
            <div className="muted" style={{ fontSize: 12, marginBottom: 10 }}>Palet Warna</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {paletteOptions.map(({ value, label, desc }) => {
                const active = palette === value
                return (
                  <button
                    key={value}
                    onClick={() => setPalette(value)}
                    aria-pressed={active}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      padding: '10px 14px',
                      borderRadius: 'var(--radius-md)',
                      border: `2px solid ${active ? 'var(--primary)' : 'transparent'}`,
                      background: active ? 'color-mix(in srgb, var(--primary) 10%, var(--surface-2))' : 'var(--surface-2)',
                      cursor: 'pointer',
                      textAlign: 'left',
                      transition: 'all 150ms',
                    }}
                  >
                    <div style={{ display: 'flex', gap: 3, flexShrink: 0 }}>
                      <div className={`swatch-${value}-primary`} style={{ width: 18, height: 18, borderRadius: 5 }} aria-hidden="true" />
                      <div className={`swatch-${value}-accent`} style={{ width: 18, height: 18, borderRadius: 5 }} aria-hidden="true" />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)', fontFamily: 'inherit' }}>{label}</div>
                      <div className="muted" style={{ fontSize: 11 }}>{desc}</div>
                    </div>
                    {active && (
                      <span style={{ fontSize: 14, color: 'var(--primary)', flexShrink: 0 }}>✓</span>
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        </div>

        {/* Mode Akun */}
        <div className="card" style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <h2 style={{ fontWeight: 600, fontSize: 15, color: 'var(--text-1)' }}>Mode Akun</h2>

          <div role="radiogroup" aria-label="Mode akun" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {([
              { value: 'lengkap' as const, label: 'Lengkap', desc: 'Semua fitur aktif', Icon: LayoutDashboard },
              { value: 'investasi' as const, label: 'Investasi', desc: 'Hanya fitur investasi', Icon: TrendingUp },
            ] as const).map(({ value, label, desc, Icon }) => {
              const active = accountMode === value
              return (
                <button
                  key={value}
                  role="radio"
                  aria-checked={active}
                  disabled={modeLocked}
                  onClick={() => { if (!active) setPendingMode(value) }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    padding: '12px 14px',
                    borderRadius: 'var(--radius-md)',
                    border: `2px solid ${active ? 'var(--primary)' : 'transparent'}`,
                    background: active ? 'color-mix(in srgb, var(--primary) 10%, var(--surface-2))' : 'var(--surface-2)',
                    cursor: modeLocked ? 'default' : 'pointer',
                    textAlign: 'left',
                    opacity: modeLocked && !active ? 0.45 : 1,
                    transition: 'all 150ms',
                  }}
                >
                  {/* Radio dot */}
                  <span
                    style={{
                      width: 18, height: 18, borderRadius: '50%', flexShrink: 0,
                      border: `2px solid ${active ? 'var(--primary)' : 'var(--text-3)'}`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}
                    aria-hidden="true"
                  >
                    {active && <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--primary)', display: 'block' }} />}
                  </span>
                  <Icon size={15} style={{ flexShrink: 0, color: active ? 'var(--primary)' : 'var(--text-3)' }} />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)', fontFamily: 'inherit' }}>{label}</div>
                    <div className="muted" style={{ fontSize: 11 }}>{desc}</div>
                  </div>
                </button>
              )
            })}
          </div>

          {modeLocked && (
            <p className="muted" style={{ fontSize: 12 }}>
              Mode dikunci.{' '}
              <button className="btn-ghost" onClick={() => setConfirmUnlock(true)} style={{ fontSize: 12, padding: '2px 6px', minHeight: 28, display: 'inline-flex', verticalAlign: 'middle' }}>
                Buka kunci
              </button>
              {' '}untuk mengubahnya.
            </p>
          )}

          {/* Kunci mode */}
          <div style={divider}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
              }}
            >
              <div>
                <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-1)', display: 'flex', alignItems: 'center', gap: 6 }}>
                  {modeLocked ? <Lock size={13} /> : <Unlock size={13} />}
                  Kunci mode
                </div>
                <div className="muted" style={{ fontSize: 11, marginTop: 2 }}>Cegah perubahan tidak sengaja</div>
              </div>
              <button
                role="switch"
                aria-checked={modeLocked}
                aria-label="Kunci mode"
                data-testid="mode-lock-toggle"
                onClick={() => modeLocked ? setConfirmUnlock(true) : setModeLocked(true)}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: 44, minHeight: 44, border: 'none', background: 'transparent', cursor: 'pointer', flexShrink: 0, padding: 0 }}
              >
                <span
                  style={{ display: 'flex', alignItems: 'center', width: 44, height: 26, padding: 3, borderRadius: 13, background: modeLocked ? 'var(--primary)' : 'var(--border)', transition: 'background 150ms', pointerEvents: 'none' }}
                  aria-hidden="true"
                >
                  <span style={{ display: 'block', width: 20, height: 20, borderRadius: '50%', background: 'var(--surface)', transform: modeLocked ? 'translateX(18px)' : 'translateX(0)', transition: 'transform 150ms' }} />
                </span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── Gagal sinkron ───────────────────────────── */}
      {failedOps.length > 0 && (
        <section ref={failedRef} className="card" style={{ padding: 20, borderColor: 'var(--expense)' }}>
          <h2 style={{ fontWeight: 600, fontSize: 15, color: 'var(--expense)', marginBottom: 12 }}>
            {failedOps.length} perubahan gagal sinkron
          </h2>
          {failedOps.map((f) => (
            <div key={f.opId} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 0', borderTop: '1px solid var(--border)' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-1)' }}>{opLabel(f)}</div>
                <div className="muted" style={{ fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.error}</div>
              </div>
              {!f.blocked && <button className="btn" onClick={() => retryFailed(f.opId)} style={{ padding: '6px 12px', minHeight: 32, fontSize: 12, flexShrink: 0 }}>Coba lagi</button>}
              <button className="btn-ghost" onClick={() => discardFailed(f.opId)} style={{ padding: '6px 12px', minHeight: 32, fontSize: 12, color: 'var(--expense)', flexShrink: 0 }}>Buang</button>
            </div>
          ))}
        </section>
      )}

      {/* ── Grid kartu data ─────────────────────────── */}
      <div className="grid md:grid-cols-2" style={{ gap: 16 }}>

        {/* Rekening */}
        <div className="card" style={{ padding: 20 }}>
          <h2 style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-1)', marginBottom: 8 }}>Rekening</h2>
          {db.accounts.length === 0 && <p className="muted" style={{ fontSize: 13, padding: '8px 0' }}>Belum ada rekening.</p>}
          {db.accounts.map((a) => {
            const current = currentBalances.get(a.id) ?? 0
            const typeLabel = a.type === 'cash' ? 'Tunai' : a.type === 'ewallet' ? 'E-wallet' : 'Bank'
            return (
              <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 0', borderTop: '1px solid var(--border)' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.name}</div>
                  <div className="muted" style={{ fontSize: 11 }}>{typeLabel} · {idr(current)}</div>
                </div>
                <button className="btn-ghost" aria-label={`Ubah ${a.name}`} onClick={() => openEditAcc(a)} style={{ padding: 8, minHeight: 40, minWidth: 40, border: 'none' }}><Pencil size={14} /></button>
                <button className="btn-ghost" aria-label={`Hapus ${a.name}`} onClick={() => tryDeleteAcc(a)} style={{ padding: 8, minHeight: 40, minWidth: 40, border: 'none' }}>✕</button>
              </div>
            )
          })}
          <form onSubmit={addAcc} style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <input className="input" placeholder="Nama rekening" value={accName} onChange={(e) => setAccName(e.target.value)} />
            <select className="input" style={{ maxWidth: 100 }} value={accType} onChange={(e) => setAccType(e.target.value as 'cash' | 'bank' | 'ewallet')}>
              <option value="bank">Bank</option>
              <option value="cash">Tunai</option>
              <option value="ewallet">E-wallet</option>
            </select>
            <button className="btn" style={{ flexShrink: 0 }}>+</button>
          </form>
          <p className="muted" style={{ fontSize: 11, marginTop: 8 }}>Isi saldo awal lewat tombol edit agar laporan akurat.</p>
        </div>

        {/* Kategori */}
        <div className="card" style={{ padding: 20 }}>
          <h2 style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-1)', marginBottom: 8 }}>Kategori Transaksi</h2>
          {db.categories.length === 0 && <p className="muted" style={{ fontSize: 13, padding: '8px 0' }}>Belum ada kategori.</p>}
          {db.categories.map((c) => {
            const budget = db.budgets.find((b: Budget) => b.category_id === c.id)
            const isEditingBudget = editingBudgetId === c.id
            return (
              <div key={c.id} style={{ borderTop: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 0' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</div>
                    <div className="muted" style={{ fontSize: 11 }}>{c.kind === 'income' ? 'Pemasukan' : 'Pengeluaran'}</div>
                  </div>
                  {c.kind === 'expense' && (
                    <button
                      className="chip"
                      aria-label={budget ? `Ubah batas ${c.name}` : `Tambah batas ${c.name}`}
                      onClick={() => isEditingBudget ? closeBudgetEdit() : openEditBudget(c.id, budget?.amount)}
                      style={{ fontSize: 11, padding: '2px 8px', cursor: 'pointer', border: 'none', background: isEditingBudget ? 'var(--primary)' : undefined, color: isEditingBudget ? 'var(--primary-fg)' : undefined }}
                    >
                      {budget ? formatShort(budget.amount) : '+ Batas'}
                    </button>
                  )}
                  <button className="btn-ghost" aria-label={`Hapus ${c.name}`} onClick={() => del('categories', c.id, c.name)} style={{ padding: 8, minHeight: 40, minWidth: 40, border: 'none' }}>✕</button>
                </div>
                {isEditingBudget && (
                  <div style={{ display: 'flex', gap: 8, paddingBottom: 10, alignItems: 'center' }}>
                    <div style={{ flex: 1 }}>
                      <MoneyInput
                        value={editBudgetVal}
                        onValueChange={setEditBudgetVal}
                        placeholder="Batas bulanan (Rp)"
                        autoFocus
                      />
                    </div>
                    <button className="btn" style={{ flexShrink: 0, padding: '8px 14px' }} onClick={() => saveBudget(c.id)}>Simpan</button>
                    {budget && (
                      <button className="btn-ghost" style={{ flexShrink: 0, padding: '8px 10px', color: 'var(--expense)' }} onClick={() => { setEditBudgetVal(null); saveBudget(c.id) }} aria-label="Hapus batas">✕</button>
                    )}
                  </div>
                )}
              </div>
            )
          })}
          <form onSubmit={addCat} style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <input className="input" placeholder="Nama kategori" value={catName} onChange={(e) => setCatName(e.target.value)} />
            <select className="input" style={{ maxWidth: 110 }} value={catKind} onChange={(e) => setCatKind(e.target.value as Kind)}>
              <option value="expense">Pengeluaran</option>
              <option value="income">Pemasukan</option>
            </select>
            <button className="btn" style={{ flexShrink: 0 }}>+</button>
          </form>
        </div>

        {/* Platform */}
        <div className="card" style={{ padding: 20 }}>
          <h2 style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-1)', marginBottom: 8 }}>Platform Investasi</h2>
          {db.platforms.length === 0 && <p className="muted" style={{ fontSize: 13, padding: '8px 0' }}>Belum ada platform.</p>}
          {db.platforms.map((p) => (
            <div key={p.id} style={{ display: 'flex', alignItems: 'center', padding: '10px 0', borderTop: '1px solid var(--border)' }}>
              <span style={{ flex: 1, fontSize: 13, fontWeight: 500, color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
              <button className="btn-ghost" aria-label={`Hapus ${p.name}`} onClick={() => del('platforms', p.id, p.name)} style={{ padding: 8, minHeight: 40, minWidth: 40, border: 'none' }}>✕</button>
            </div>
          ))}
          <form onSubmit={addPlat} style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <input className="input" placeholder="Nama platform" value={platName} onChange={(e) => setPlatName(e.target.value)} />
            <button className="btn" style={{ flexShrink: 0 }}>+</button>
          </form>
        </div>

        {/* Aset */}
        <div className="card" style={{ padding: 20 }}>
          <h2 style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-1)', marginBottom: 8 }}>Aset Investasi</h2>
          {db.assets.length === 0 && <p className="muted" style={{ fontSize: 13, padding: '8px 0' }}>Belum ada aset.</p>}
          {db.assets.map((a) => (
            <div key={a.id} style={{ display: 'flex', alignItems: 'center', padding: '10px 0', borderTop: '1px solid var(--border)' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-1)' }}>{a.name} <span className="muted">({a.symbol})</span></div>
                <div className="muted" style={{ fontSize: 11 }}>{a.price_source === 'indodax' ? `Live: ${a.price_ref}` : 'Harga manual'}</div>
              </div>
              <button className="btn-ghost" aria-label={`Hapus ${a.name}`} onClick={() => del('assets', a.id, a.name)} style={{ padding: 8, minHeight: 40, minWidth: 40, border: 'none' }}>✕</button>
            </div>
          ))}
          <form onSubmit={addAsset} style={{ marginTop: 12, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <input className="input" placeholder="Simbol (BTC)" value={asset.symbol} onChange={(e) => setAsset({ ...asset, symbol: e.target.value })} />
            <input className="input" placeholder="Nama (Bitcoin)" value={asset.name} onChange={(e) => setAsset({ ...asset, name: e.target.value })} />
            <select className="input" value={asset.asset_type} onChange={(e) => setAsset({ ...asset, asset_type: e.target.value as Asset['asset_type'] })}>
              <option value="crypto">Kripto</option>
              <option value="gold">Emas</option>
              <option value="stock">Saham</option>
              <option value="fund">Reksadana</option>
              <option value="other">Lainnya</option>
            </select>
            <input className="input" placeholder="Satuan (gram, BTC)" value={asset.unit} onChange={(e) => setAsset({ ...asset, unit: e.target.value })} />
            <select className="input" value={asset.price_source} onChange={(e) => { setAsset({ ...asset, price_source: e.target.value as Asset['price_source'], price_ref: '' }); setIndodaxCustom(false) }}>
              <option value="manual">Harga manual</option>
              <option value="indodax">Live Indodax</option>
            </select>
            {asset.price_source === 'indodax' ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <select
                  className="input"
                  value={indodaxCustom ? '__custom__' : (asset.price_ref || '')}
                  onChange={(e) => {
                    if (e.target.value === '__custom__') {
                      setIndodaxCustom(true)
                      setAsset({ ...asset, price_ref: '' })
                    } else {
                      setIndodaxCustom(false)
                      setAsset({ ...asset, price_ref: e.target.value })
                    }
                  }}
                >
                  <option value="">Pilih aset Indodax...</option>
                  {INDODAX_PAIRS.map((p) => (
                    <option key={p.pair} value={p.pair}>{p.label}</option>
                  ))}
                </select>
                {indodaxCustom && (
                  <input className="input" placeholder="Pair Indodax (mis: btcidr)" value={asset.price_ref} onChange={(e) => setAsset({ ...asset, price_ref: e.target.value.trim().toLowerCase() })} />
                )}
              </div>
            ) : <div />}
            <button className="btn" style={{ gridColumn: '1 / -1' }}>Tambah Aset</button>
          </form>
        </div>

        {/* Kontributor */}
        <div className="card" style={{ padding: 20 }}>
          <h2 style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-1)', marginBottom: 8 }}>Kontributor</h2>
          {db.contributors.length === 0 && <p className="muted" style={{ fontSize: 13, padding: '8px 0' }}>Belum ada kontributor.</p>}
          {[...db.contributors].sort((a, b) => a.sort_order - b.sort_order).map((c) => (
            <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 0', borderTop: '1px solid var(--border)' }}>
              <span style={{ flex: 1, fontSize: 13, fontWeight: 500, color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</span>
              <button className="btn-ghost" aria-label={`Ubah ${c.name}`} onClick={() => openEditContrib(c)} style={{ padding: 8, minHeight: 40, minWidth: 40, border: 'none' }}><Pencil size={14} /></button>
              <button className="btn-ghost" aria-label={`Hapus ${c.name}`} onClick={() => tryDeleteContrib(c)} style={{ padding: 8, minHeight: 40, minWidth: 40, border: 'none' }}>✕</button>
            </div>
          ))}
          <form onSubmit={addContrib} style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', gap: 8 }}>
              <input className="input" placeholder="Nama kontributor" value={contribName} onChange={(e) => { setContribName(e.target.value); setContribNameError(null) }} />
              <button className="btn" style={{ flexShrink: 0 }}>+</button>
            </div>
            {contribNameError && <p style={{ fontSize: 12, color: 'var(--expense)', margin: 0 }}>{contribNameError}</p>}
          </form>
          <p className="muted" style={{ fontSize: 11, marginTop: 8 }}>Dicatat per transaksi investasi untuk menghitung porsi masing-masing.</p>
        </div>

        {/* Data & Akun */}
        <div className="card" style={{ padding: 20 }}>
          <h2 style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-1)', marginBottom: 12 }}>Data dan Akun</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {[
              { label: 'Ekspor transaksi (CSV)', action: () => downloadCSV('transaksi.csv', [['tanggal','jenis','nominal','kategori','rekening','catatan'], ...db.transactions.map((t) => [t.occurred_on, t.kind, t.amount, db.categories.find((c) => c.id === t.category_id)?.name ?? '', db.accounts.find((a) => a.id === t.account_id)?.name ?? '', t.note])]) },
              { label: 'Ekspor investasi (CSV)', action: () => downloadCSV('investasi.csv', [['tanggal','aset','platform','sisi','jumlah','harga_per_unit','fee'], ...db.trades.map((t) => [t.traded_on, db.assets.find((a) => a.id === t.asset_id)?.symbol ?? '', db.platforms.find((p) => p.id === t.platform_id)?.name ?? '', t.side, t.quantity, t.price_per_unit, t.fee])]) },
              { label: 'Sinkronkan sekarang', action: () => void refresh() },
            ].map(({ label, action }) => (
              <button key={label} className="btn-ghost" onClick={action} style={{ justifyContent: 'flex-start', width: '100%' }}>
                {label}
              </button>
            ))}
          </div>
          <p className="muted" style={{ fontSize: 11, margin: '10px 0' }}>Menunggu: {pending} · Gagal: {failed}</p>
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12 }}>
            <button className="btn-ghost" onClick={onLogout} style={{ justifyContent: 'flex-start', color: 'var(--expense)', width: '100%' }}>
              Keluar dari akun
            </button>
          </div>
        </div>
      </div>

      {/* ── Sheets & Dialogs ─────────────────────────── */}
      <Sheet open={editingAcc !== null} onClose={closeEditAcc} title="Ubah Rekening" footer={<><button type="button" className="btn-ghost" onClick={closeEditAcc}>Batal</button><button type="submit" form="edit-acc-form" className="btn">Simpan</button></>}>
        <form id="edit-acc-form" onSubmit={submitEditAcc} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Field label="Nama rekening" htmlFor="edit-acc-name" error={editAccError ?? undefined}>
            <input id="edit-acc-name" className="input" value={editAccName} onChange={(e) => setEditAccName(e.target.value)} autoFocus />
          </Field>
          <Field label="Jenis" htmlFor="edit-acc-type">
            <select id="edit-acc-type" className="input" value={editAccType} onChange={(e) => setEditAccType(e.target.value as 'cash' | 'bank' | 'ewallet')}>
              <option value="bank">Bank</option><option value="cash">Tunai</option><option value="ewallet">E-wallet</option>
            </select>
          </Field>
          <Field label="Saldo awal" htmlFor="edit-acc-opening">
            <MoneyInput id="edit-acc-opening" value={editAccOpening} onValueChange={setEditAccOpening} />
            <p className="muted" style={{ fontSize: 12, marginTop: 6 }}>Isi saldo sebelum catatan pertama di Artha.</p>
          </Field>
        </form>
      </Sheet>

      <Sheet open={editingContrib !== null} onClose={closeEditContrib} title="Ubah Kontributor" footer={<><button type="button" className="btn-ghost" onClick={closeEditContrib}>Batal</button><button type="submit" form="edit-contrib-form" className="btn">Simpan</button></>}>
        <form id="edit-contrib-form" onSubmit={submitEditContrib} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Field label="Nama" htmlFor="edit-contrib-name" error={editContribError ?? undefined}>
            <input id="edit-contrib-name" className="input" value={editContribName} onChange={(e) => { setEditContribName(e.target.value); setEditContribError(null) }} autoFocus />
          </Field>
        </form>
      </Sheet>

      <ConfirmDialog open={confirmAcc !== null} title="Hapus Rekening" message={confirmAcc ? `Hapus rekening "${confirmAcc.name}"?` : ''} confirmLabel="Hapus" onConfirm={confirmDeleteAcc} onCancel={() => setConfirmAcc(null)} />
      <ConfirmDialog open={blockedAcc !== null} title={blockedAcc ? `Tidak bisa menghapus ${blockedAcc.name}` : ''} message={blockedAcc?.message ?? ''} confirmLabel="Mengerti" onConfirm={() => setBlockedAcc(null)} onCancel={() => setBlockedAcc(null)} />
      <ConfirmDialog open={confirmDel !== null} title="Hapus" message={confirmDel ? `Hapus "${confirmDel.label}"?` : ''} confirmLabel="Hapus" onConfirm={() => { if (confirmDel) { remove(confirmDel.table, confirmDel.id); setConfirmDel(null) } }} onCancel={() => setConfirmDel(null)} />
      <ConfirmDialog open={blockedAsset !== null} title={blockedAsset ? `Tidak bisa menghapus ${blockedAsset.name}` : ''} message={blockedAsset?.message ?? ''} confirmLabel="Mengerti" onConfirm={() => setBlockedAsset(null)} onCancel={() => setBlockedAsset(null)} />
      <ConfirmDialog open={pendingMode === 'investasi'} title="Ganti ke Mode Investasi?" message="Tab Transaksi dan Laporan akan disembunyikan. Data tidak akan terhapus dan bisa diakses kembali dengan mengganti mode ke Lengkap." confirmLabel="Ganti Mode" onConfirm={() => { setAccountMode('investasi'); setPendingMode(null) }} onCancel={() => setPendingMode(null)} />
      <ConfirmDialog open={pendingMode === 'lengkap'} title="Ganti ke Mode Lengkap?" message="Semua fitur ditampilkan kembali. Data tidak berubah." confirmLabel="Ganti Mode" onConfirm={() => { setAccountMode('lengkap'); setPendingMode(null) }} onCancel={() => setPendingMode(null)} />
      <ConfirmDialog open={confirmUnlock} title="Buka Kunci Mode?" message="Setelah dibuka, mode bisa diubah dari halaman ini." confirmLabel="Buka Kunci" onConfirm={() => { setModeLocked(false); setConfirmUnlock(false) }} onCancel={() => setConfirmUnlock(false)} />
      <ConfirmDialog open={confirmDelContrib !== null} title="Hapus Kontributor" message={confirmDelContrib ? (confirmDelContrib.tradeCount > 0 ? `Hapus kontributor "${confirmDelContrib.name}"? ${confirmDelContrib.tradeCount} catatan akan menjadi Tanpa nama.` : `Hapus kontributor "${confirmDelContrib.name}"?`) : ''} confirmLabel="Hapus" onConfirm={confirmDeleteContrib} onCancel={() => setConfirmDelContrib(null)} />
    </div>
  )
}
