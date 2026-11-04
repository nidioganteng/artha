import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { Sun, Moon, Monitor, Pencil } from 'lucide-react'
import { useStore } from '../lib/store'
import { useTheme } from '../lib/theme'
import type { FailedOp } from '../lib/store'
import type { Account, Asset, Contributor, Kind, TableName } from '../lib/types'
import type { Mode, Palette } from '../lib/theme'
import { Sheet, Field, MoneyInput, ConfirmDialog } from '../ui'
import { accountBalance } from '../lib/ledger'
import { idr } from '../lib/format'

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
}

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

// ──────────────────────────────────────────────────────
// Section wrapper
// ──────────────────────────────────────────────────────
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: 0 }}>
      <h2
        style={{
          fontWeight: 600,
          fontSize: 16,
          color: 'var(--text-1)',
          marginBottom: 12,
          paddingTop: 4,
        }}
      >
        {title}
      </h2>
      {children}
    </section>
  )
}

// ──────────────────────────────────────────────────────
// List row with delete button
// ──────────────────────────────────────────────────────
function ListRow({ label, sub, onDelete }: { label: string; sub?: string; onDelete: () => void }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        padding: '10px 0',
        borderTop: '1px solid var(--border)',
      }}
    >
      <div style={{ minWidth: 0, flex: 1 }}>
        <div
          style={{
            fontSize: 14,
            color: 'var(--text-1)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {label}
        </div>
        {sub && (
          <div className="muted" style={{ fontSize: 12 }}>
            {sub}
          </div>
        )}
      </div>
      <button
        className="btn-ghost"
        aria-label={`Hapus ${label}`}
        onClick={onDelete}
        style={{ padding: 8, minHeight: 44, minWidth: 44, border: 'none', flexShrink: 0 }}
      >
        ✕
      </button>
    </div>
  )
}

export default function Settings({ onLogout, focusFailed }: { onLogout: () => void; focusFailed?: boolean }) {
  const { db, save, remove, refresh, pending, failed, failedOps, retryFailed, discardFailed } = useStore()
  const { mode, setMode, palette, setPalette } = useTheme()
  const failedRef = useRef<HTMLElement>(null)

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

  // Edit Rekening (Sheet)
  const [editingAcc, setEditingAcc] = useState<Account | null>(null)
  const [editAccName, setEditAccName] = useState('')
  const [editAccType, setEditAccType] = useState<'cash' | 'bank' | 'ewallet'>('bank')
  const [editAccOpening, setEditAccOpening] = useState<number | null>(0)
  const [editAccError, setEditAccError] = useState<string | null>(null)

  // Hapus Rekening (Confirm dengan pesan dinamis)
  const [confirmAcc, setConfirmAcc] = useState<{ id: string; name: string } | null>(null)
  const [blockedAcc, setBlockedAcc] = useState<{ name: string; message: string } | null>(null)

  // Hapus Kategori, Platform, Aset
  const [confirmDel, setConfirmDel] = useState<{ table: 'categories' | 'platforms' | 'assets'; id: string; label: string } | null>(null)
  const [blockedAsset, setBlockedAsset] = useState<{ name: string; message: string } | null>(null)

  // Kontributor
  const [contribName, setContribName] = useState('')
  const [contribNameError, setContribNameError] = useState<string | null>(null)
  const [editingContrib, setEditingContrib] = useState<Contributor | null>(null)
  const [editContribName, setEditContribName] = useState('')
  const [editContribError, setEditContribError] = useState<string | null>(null)
  const [confirmDelContrib, setConfirmDelContrib] = useState<{ id: string; name: string } | null>(null)
  const [blockedContrib, setBlockedContrib] = useState<{ name: string; message: string } | null>(null)

  // Saldo saat ini per rekening (dari ledger)
  const currentBalances = useMemo(() => {
    const map = new Map<string, number>()
    for (const a of db.accounts) {
      map.set(a.id, accountBalance(a, db.transactions, db.trades))
    }
    return map
  }, [db.accounts, db.transactions, db.trades])

  function openEditAcc(a: Account) {
    setEditingAcc(a)
    setEditAccName(a.name)
    setEditAccType((a.type ?? 'bank') as 'cash' | 'bank' | 'ewallet')
    setEditAccOpening(a.opening_balance ?? 0)
    setEditAccError(null)
  }

  function closeEditAcc() {
    setEditingAcc(null)
    setEditAccError(null)
  }

  function submitEditAcc(e: FormEvent) {
    e.preventDefault()
    if (!editingAcc) return
    if (!editAccName.trim()) {
      setEditAccError('Nama rekening wajib diisi.')
      return
    }
    save('accounts', {
      ...editingAcc,
      name: editAccName.trim(),
      type: editAccType,
      opening_balance: editAccOpening ?? 0,
    })
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
      setBlockedAcc({
        name: a.name,
        message: `Rekening ini masih dipakai di ${parts.join(' dan ')}. Pindahkan atau hapus referensinya dulu.`,
      })
      return
    }
    setConfirmAcc({ id: a.id, name: a.name })
  }

  function confirmDeleteAcc() {
    if (!confirmAcc) return
    remove('accounts', confirmAcc.id)
    setConfirmAcc(null)
  }
  const [asset, setAsset] = useState({
    symbol: '',
    name: '',
    asset_type: 'crypto' as Asset['asset_type'],
    unit: '',
    price_source: 'manual' as Asset['price_source'],
    price_ref: '',
  })

  function addCat(e: FormEvent) {
    e.preventDefault()
    if (!catName.trim()) return
    save('categories', { name: catName.trim(), kind: catKind })
    setCatName('')
  }
  function addAcc(e: FormEvent) {
    e.preventDefault()
    if (!accName.trim()) return
    save('accounts', { name: accName.trim(), type: accType, opening_balance: 0 })
    setAccName('')
  }
  function addPlat(e: FormEvent) {
    e.preventDefault()
    if (!platName.trim()) return
    save('platforms', { name: platName.trim() })
    setPlatName('')
  }
  function addAsset(e: FormEvent) {
    e.preventDefault()
    if (!asset.symbol.trim() || !asset.name.trim()) return
    save('assets', {
      symbol: asset.symbol.trim().toUpperCase(),
      name: asset.name.trim(),
      asset_type: asset.asset_type,
      unit: asset.unit.trim() || 'unit',
      price_source: asset.price_source,
      price_ref:
        asset.price_source === 'indodax'
          ? asset.price_ref.trim().toLowerCase() || null
          : null,
      manual_price: null,
      manual_price_at: null,
    })
    setAsset({ ...asset, symbol: '', name: '', unit: '', price_ref: '' })
  }

  function del(
    table: 'categories' | 'platforms' | 'assets',
    id: string,
    label: string,
  ) {
    if (table === 'assets' && db.trades.some((t) => t.asset_id === id)) {
      setBlockedAsset({
        name: label,
        message: 'Aset ini masih punya catatan pembelian/penjualan. Hapus catatannya dulu di tab Investasi.',
      })
      return
    }
    setConfirmDel({ table, id, label })
  }

  function addContrib(e: FormEvent) {
    e.preventDefault()
    const trimmed = contribName.trim()
    if (!trimmed) return
    if (db.contributors.some((c) => c.name.toLowerCase() === trimmed.toLowerCase())) {
      setContribNameError('Nama sudah dipakai.')
      return
    }
    save('contributors', { name: trimmed, sort_order: db.contributors.length })
    setContribName('')
    setContribNameError(null)
  }

  function openEditContrib(c: Contributor) {
    setEditingContrib(c)
    setEditContribName(c.name)
    setEditContribError(null)
  }

  function closeEditContrib() {
    setEditingContrib(null)
    setEditContribError(null)
  }

  function submitEditContrib(e: FormEvent) {
    e.preventDefault()
    if (!editingContrib) return
    const trimmed = editContribName.trim()
    if (!trimmed) {
      setEditContribError('Nama wajib diisi.')
      return
    }
    if (db.contributors.some((c) => c.id !== editingContrib.id && c.name.toLowerCase() === trimmed.toLowerCase())) {
      setEditContribError('Nama sudah dipakai kontributor lain.')
      return
    }
    save('contributors', { ...editingContrib, name: trimmed })
    closeEditContrib()
  }

  function tryDeleteContrib(c: Contributor) {
    const trCount = db.trades.filter((t) => t.contributor_id === c.id).length
    if (trCount > 0) {
      setBlockedContrib({
        name: c.name,
        message: `Kontributor ini masih dipakai di ${trCount} catatan investasi. Ubah catatannya dulu di tab Investasi.`,
      })
      return
    }
    setConfirmDelContrib({ id: c.id, name: c.name })
  }

  function confirmDeleteContrib() {
    if (!confirmDelContrib) return
    remove('contributors', confirmDelContrib.id)
    setConfirmDelContrib(null)
  }

  const modeOptions: { value: Mode; label: string; Icon: typeof Sun }[] = [
    { value: 'light', label: 'Terang', Icon: Sun },
    { value: 'system', label: 'Sistem', Icon: Monitor },
    { value: 'dark', label: 'Gelap', Icon: Moon },
  ]

  const paletteOptions: { value: Palette; label: string; desc: string }[] = [
    { value: 'a', label: 'Lime & Hutan', desc: 'Hijau modern' },
    { value: 'b', label: 'Sage & Greige', desc: 'Hangat & natural' },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      <h1
        style={{
          fontWeight: 700,
          fontSize: 22,
          color: 'var(--text-1)',
          letterSpacing: '-0.02em',
          marginBottom: 24,
        }}
      >
        Pengaturan
      </h1>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

        {/* ── Tampilan ─────────────────────────────────── */}
        <div className="card" style={{ padding: 24 }}>
          <Section title="Tampilan">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              {/* Mode picker */}
              <div>
                <div className="label" style={{ display: 'block', marginBottom: 10 }}>
                  Mode
                </div>
                <div
                  role="radiogroup"
                  aria-label="Mode tampilan"
                  style={{
                    display: 'inline-flex',
                    background: 'var(--surface-2)',
                    borderRadius: 'var(--radius-md)',
                    padding: 3,
                    gap: 2,
                  }}
                >
                  {modeOptions.map(({ value, label, Icon }) => {
                    const active = mode === value
                    return (
                      <button
                        key={value}
                        role="radio"
                        aria-checked={active}
                        onClick={() => setMode(value)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
                          padding: '8px 14px',
                          borderRadius: 'calc(var(--radius-md) - 2px)',
                          border: 'none',
                          background: active ? 'var(--surface)' : 'transparent',
                          color: active ? 'var(--text-1)' : 'var(--text-3)',
                          fontFamily: 'inherit',
                          fontSize: 13,
                          fontWeight: active ? 600 : 400,
                          cursor: 'pointer',
                          boxShadow: active ? 'var(--shadow-sm)' : 'none',
                          transition: 'all 150ms ease-out',
                          minHeight: 44,
                        }}
                      >
                        <Icon size={14} />
                        {label}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Palette picker */}
              <div>
                <div className="label" style={{ display: 'block', marginBottom: 10 }}>
                  Palet Warna
                </div>
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
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
                          padding: '12px 16px',
                          borderRadius: 'var(--radius-md)',
                          border: `2px solid ${active ? 'var(--primary)' : 'var(--border)'}`,
                          background: 'var(--surface)',
                          cursor: 'pointer',
                          minHeight: 44,
                          textAlign: 'left' as const,
                          transition: 'border-color 150ms ease-out',
                        }}
                      >
                        {/* Swatch pair */}
                        <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                          <div
                            className={`swatch-${value}-primary`}
                            style={{ width: 20, height: 20, borderRadius: 6 }}
                            aria-hidden="true"
                          />
                          <div
                            className={`swatch-${value}-accent`}
                            style={{ width: 20, height: 20, borderRadius: 6 }}
                            aria-hidden="true"
                          />
                        </div>
                        <div style={{ minWidth: 0 }}>
                          <div
                            style={{
                              fontSize: 14,
                              fontWeight: 600,
                              color: 'var(--text-1)',
                            }}
                          >
                            {label}
                          </div>
                          <div className="muted" style={{ fontSize: 12 }}>{desc}</div>
                        </div>
                        {active && (
                          <div
                            style={{
                              marginLeft: 'auto',
                              width: 18,
                              height: 18,
                              borderRadius: '50%',
                              background: 'var(--primary)',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              color: 'var(--primary-fg)',
                              fontSize: 12,
                              fontWeight: 700,
                              flexShrink: 0,
                            }}
                          >
                            ✓
                          </div>
                        )}
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>
          </Section>
        </div>

        {/* ── Gagal sinkron ────────────────────────────── */}
        {failedOps.length > 0 && (
          <section
            ref={failedRef}
            className="card"
            style={{ padding: 20, borderColor: 'var(--expense)' }}
          >
            <h2
              style={{
                fontWeight: 600,
                fontSize: 15,
                color: 'var(--expense)',
                marginBottom: 12,
              }}
            >
              {failedOps.length} perubahan gagal sinkron
            </h2>
            <div className="divide-token">
              {failedOps.map((f) => (
                <div
                  key={f.opId}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 10,
                    padding: '10px 0',
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-1)' }}>
                      {opLabel(f)}
                    </div>
                    <div
                      className="muted"
                      style={{
                        fontSize: 12,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {f.error}
                    </div>
                  </div>
                  {!f.blocked && (
                    <button
                      className="btn"
                      onClick={() => retryFailed(f.opId)}
                      style={{ padding: '6px 12px', minHeight: 32, fontSize: 12, flexShrink: 0 }}
                    >
                      Coba lagi
                    </button>
                  )}
                  <button
                    className="btn-ghost"
                    onClick={() => discardFailed(f.opId)}
                    style={{
                      padding: '6px 12px',
                      minHeight: 32,
                      fontSize: 12,
                      color: 'var(--expense)',
                      flexShrink: 0,
                    }}
                  >
                    Buang
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ── 2-kolom on desktop ───────────────────────── */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
            gap: 16,
          }}
        >
          {/* Aset investasi */}
          <div className="card" style={{ padding: 20 }}>
            <Section title="Aset Investasi">
              <div>
                {db.assets.length === 0 && (
                  <p className="muted" style={{ fontSize: 13 }}>Belum ada aset.</p>
                )}
                {db.assets.map((a) => (
                  <ListRow
                    key={a.id}
                    label={`${a.name} (${a.symbol})`}
                    sub={
                      a.price_source === 'indodax'
                        ? `Live Indodax: ${a.price_ref}`
                        : 'Harga manual'
                    }
                    onDelete={() => del('assets', a.id, a.name)}
                  />
                ))}
              </div>
              <form
                onSubmit={addAsset}
                style={{ marginTop: 12, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}
              >
                <input
                  className="input"
                  placeholder="Simbol (BTC)"
                  value={asset.symbol}
                  onChange={(e) => setAsset({ ...asset, symbol: e.target.value })}
                />
                <input
                  className="input"
                  placeholder="Nama (Bitcoin)"
                  value={asset.name}
                  onChange={(e) => setAsset({ ...asset, name: e.target.value })}
                />
                <select
                  className="input"
                  value={asset.asset_type}
                  onChange={(e) =>
                    setAsset({ ...asset, asset_type: e.target.value as Asset['asset_type'] })
                  }
                >
                  <option value="crypto">Kripto</option>
                  <option value="gold">Emas</option>
                  <option value="stock">Saham</option>
                  <option value="fund">Reksadana</option>
                  <option value="other">Lainnya</option>
                </select>
                <input
                  className="input"
                  placeholder="Satuan (gram, BTC)"
                  value={asset.unit}
                  onChange={(e) => setAsset({ ...asset, unit: e.target.value })}
                />
                <select
                  className="input"
                  value={asset.price_source}
                  onChange={(e) =>
                    setAsset({ ...asset, price_source: e.target.value as Asset['price_source'] })
                  }
                >
                  <option value="manual">Harga manual</option>
                  <option value="indodax">Live Indodax</option>
                </select>
                {asset.price_source === 'indodax' ? (
                  <input
                    className="input"
                    placeholder="Pair (btcidr)"
                    value={asset.price_ref}
                    onChange={(e) => setAsset({ ...asset, price_ref: e.target.value })}
                  />
                ) : (
                  <div />
                )}
                <button className="btn" style={{ gridColumn: '1 / -1' }}>
                  Tambah Aset
                </button>
              </form>
            </Section>
          </div>

          {/* Platform & Rekening */}
          <div className="card" style={{ padding: 20 }}>
            <Section title="Platform Investasi">
              <div>
                {db.platforms.length === 0 && (
                  <p className="muted" style={{ fontSize: 13 }}>Belum ada platform.</p>
                )}
                {db.platforms.map((p) => (
                  <ListRow
                    key={p.id}
                    label={p.name}
                    onDelete={() => del('platforms', p.id, p.name)}
                  />
                ))}
              </div>
              <form
                onSubmit={addPlat}
                style={{ marginTop: 12, display: 'flex', gap: 8 }}
              >
                <input
                  className="input"
                  placeholder="Nama platform"
                  value={platName}
                  onChange={(e) => setPlatName(e.target.value)}
                />
                <button className="btn" style={{ flexShrink: 0 }}>Tambah</button>
              </form>
            </Section>

            <div style={{ borderTop: '1px solid var(--border)', paddingTop: 20, marginTop: 20 }}>
              <Section title="Rekening">
                <div>
                  {db.accounts.length === 0 && (
                    <p className="muted" style={{ fontSize: 13 }}>Belum ada rekening.</p>
                  )}
                  {db.accounts.map((a) => {
                    const opening = a.opening_balance ?? 0
                    const current = currentBalances.get(a.id) ?? 0
                    const typeLabel =
                      a.type === 'cash' ? 'Tunai' : a.type === 'ewallet' ? 'E-wallet' : 'Bank'
                    return (
                      <div
                        key={a.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 12,
                          padding: '12px 0',
                          borderTop: '1px solid var(--border)',
                        }}
                      >
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div
                            style={{
                              fontSize: 14,
                              color: 'var(--text-1)',
                              fontWeight: 500,
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {a.name}
                          </div>
                          <div
                            className="muted"
                            style={{ fontSize: 12, display: 'flex', gap: 10, flexWrap: 'wrap' }}
                          >
                            <span>{typeLabel}</span>
                            <span>Awal: {idr(opening)}</span>
                            <span style={{ color: 'var(--text-2)' }}>Saat ini: {idr(current)}</span>
                          </div>
                        </div>
                        <button
                          className="btn-ghost"
                          aria-label={`Ubah ${a.name}`}
                          onClick={() => openEditAcc(a)}
                          style={{
                            padding: 8,
                            minHeight: 44,
                            minWidth: 44,
                            border: 'none',
                            flexShrink: 0,
                          }}
                        >
                          <Pencil size={16} />
                        </button>
                        <button
                          className="btn-ghost"
                          aria-label={`Hapus ${a.name}`}
                          onClick={() => tryDeleteAcc(a)}
                          style={{
                            padding: 8,
                            minHeight: 44,
                            minWidth: 44,
                            border: 'none',
                            flexShrink: 0,
                          }}
                        >
                          ✕
                        </button>
                      </div>
                    )
                  })}
                </div>
                <form
                  onSubmit={addAcc}
                  style={{ marginTop: 12, display: 'flex', gap: 8 }}
                >
                  <input
                    className="input"
                    placeholder="Nama rekening"
                    value={accName}
                    onChange={(e) => setAccName(e.target.value)}
                  />
                  <select
                    className="input"
                    style={{ maxWidth: 120 }}
                    value={accType}
                    onChange={(e) =>
                      setAccType(e.target.value as 'cash' | 'bank' | 'ewallet')
                    }
                  >
                    <option value="bank">Bank</option>
                    <option value="cash">Tunai</option>
                    <option value="ewallet">E-wallet</option>
                  </select>
                  <button className="btn" style={{ flexShrink: 0 }}>Tambah</button>
                </form>
                <p className="muted" style={{ fontSize: 12, marginTop: 10 }}>
                  Isi saldo awal di tombol ubah agar laporan saldo akurat.
                </p>
              </Section>
            </div>
          </div>

          {/* Kategori */}
          <div className="card" style={{ padding: 20 }}>
            <Section title="Kategori Transaksi">
              <div>
                {db.categories.length === 0 && (
                  <p className="muted" style={{ fontSize: 13 }}>Belum ada kategori.</p>
                )}
                {db.categories.map((c) => (
                  <ListRow
                    key={c.id}
                    label={c.name}
                    sub={c.kind === 'income' ? 'pemasukan' : 'pengeluaran'}
                    onDelete={() => del('categories', c.id, c.name)}
                  />
                ))}
              </div>
              <form
                onSubmit={addCat}
                style={{ marginTop: 12, display: 'flex', gap: 8 }}
              >
                <input
                  className="input"
                  placeholder="Nama kategori"
                  value={catName}
                  onChange={(e) => setCatName(e.target.value)}
                />
                <select
                  className="input"
                  style={{ maxWidth: 140 }}
                  value={catKind}
                  onChange={(e) => setCatKind(e.target.value as Kind)}
                >
                  <option value="expense">Pengeluaran</option>
                  <option value="income">Pemasukan</option>
                </select>
                <button className="btn" style={{ flexShrink: 0 }}>Tambah</button>
              </form>
            </Section>
          </div>

          {/* Kontributor */}
          <div className="card" style={{ padding: 20 }}>
            <Section title="Kontributor">
              <div>
                {db.contributors.length === 0 && (
                  <p className="muted" style={{ fontSize: 13 }}>Belum ada kontributor.</p>
                )}
                {[...db.contributors].sort((a, b) => a.sort_order - b.sort_order).map((c) => (
                  <div
                    key={c.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      padding: '10px 0',
                      borderTop: '1px solid var(--border)',
                    }}
                  >
                    <div
                      style={{
                        flex: 1,
                        minWidth: 0,
                        fontSize: 14,
                        color: 'var(--text-1)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {c.name}
                    </div>
                    <button
                      className="btn-ghost"
                      aria-label={`Ubah ${c.name}`}
                      onClick={() => openEditContrib(c)}
                      style={{ padding: 8, minHeight: 44, minWidth: 44, border: 'none', flexShrink: 0 }}
                    >
                      <Pencil size={16} />
                    </button>
                    <button
                      className="btn-ghost"
                      aria-label={`Hapus ${c.name}`}
                      onClick={() => tryDeleteContrib(c)}
                      style={{ padding: 8, minHeight: 44, minWidth: 44, border: 'none', flexShrink: 0 }}
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
              <form onSubmit={addContrib} style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    className="input"
                    placeholder="Nama kontributor"
                    value={contribName}
                    onChange={(e) => { setContribName(e.target.value); setContribNameError(null) }}
                  />
                  <button className="btn" style={{ flexShrink: 0 }}>Tambah</button>
                </div>
                {contribNameError && (
                  <p style={{ fontSize: 12, color: 'var(--expense)', margin: 0 }}>{contribNameError}</p>
                )}
              </form>
              <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>
                Kontributor dicatat per transaksi investasi untuk menghitung porsi masing-masing.
              </p>
            </Section>
          </div>

          {/* Data & Akun */}
          <div className="card" style={{ padding: 20 }}>
            <Section title="Data dan Akun">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <button
                  className="btn-ghost"
                  style={{ justifyContent: 'flex-start' }}
                  onClick={() =>
                    downloadCSV('transaksi.csv', [
                      ['tanggal', 'jenis', 'nominal', 'kategori', 'rekening', 'catatan'],
                      ...db.transactions.map((t) => [
                        t.occurred_on,
                        t.kind,
                        t.amount,
                        db.categories.find((c) => c.id === t.category_id)?.name ?? '',
                        db.accounts.find((a) => a.id === t.account_id)?.name ?? '',
                        t.note,
                      ]),
                    ])
                  }
                >
                  Ekspor transaksi (CSV)
                </button>
                <button
                  className="btn-ghost"
                  style={{ justifyContent: 'flex-start' }}
                  onClick={() =>
                    downloadCSV('investasi.csv', [
                      ['tanggal', 'aset', 'platform', 'sisi', 'jumlah', 'harga_per_unit', 'fee'],
                      ...db.trades.map((t) => [
                        t.traded_on,
                        db.assets.find((a) => a.id === t.asset_id)?.symbol ?? '',
                        db.platforms.find((p) => p.id === t.platform_id)?.name ?? '',
                        t.side,
                        t.quantity,
                        t.price_per_unit,
                        t.fee,
                      ]),
                    ])
                  }
                >
                  Ekspor investasi (CSV)
                </button>
                <button
                  className="btn-ghost"
                  style={{ justifyContent: 'flex-start' }}
                  onClick={() => void refresh()}
                >
                  Sinkronkan sekarang
                </button>
                <button
                  className="btn-ghost"
                  style={{ justifyContent: 'flex-start' }}
                  onClick={() => {
                    window.location.hash = 'lap'
                  }}
                >
                  Lihat laporan bulanan
                </button>
                <p className="muted" style={{ fontSize: 12 }}>
                  Menunggu: {pending} · Gagal: {failed}
                </p>
                <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12, marginTop: 4 }}>
                  <button
                    className="btn-ghost"
                    onClick={onLogout}
                    style={{
                      justifyContent: 'flex-start',
                      color: 'var(--expense)',
                      width: '100%',
                    }}
                  >
                    Keluar dari akun
                  </button>
                </div>
              </div>
            </Section>
          </div>
        </div>
      </div>

      {/* ── Edit Rekening ────────────────────────────── */}
      <Sheet
        open={editingAcc !== null}
        onClose={closeEditAcc}
        title="Ubah Rekening"
        footer={
          <>
            <button type="button" className="btn-ghost" onClick={closeEditAcc}>
              Batal
            </button>
            <button type="submit" form="edit-acc-form" className="btn">
              Simpan
            </button>
          </>
        }
      >
        <form
          id="edit-acc-form"
          onSubmit={submitEditAcc}
          style={{ display: 'flex', flexDirection: 'column', gap: 14 }}
        >
          <Field label="Nama rekening" htmlFor="edit-acc-name" error={editAccError ?? undefined}>
            <input
              id="edit-acc-name"
              className="input"
              value={editAccName}
              onChange={(e) => setEditAccName(e.target.value)}
              autoFocus
            />
          </Field>
          <Field label="Jenis" htmlFor="edit-acc-type">
            <select
              id="edit-acc-type"
              className="input"
              value={editAccType}
              onChange={(e) =>
                setEditAccType(e.target.value as 'cash' | 'bank' | 'ewallet')
              }
            >
              <option value="bank">Bank</option>
              <option value="cash">Tunai</option>
              <option value="ewallet">E-wallet</option>
            </select>
          </Field>
          <Field label="Saldo awal" htmlFor="edit-acc-opening">
            <MoneyInput
              id="edit-acc-opening"
              value={editAccOpening}
              onValueChange={setEditAccOpening}
            />
            <p className="muted" style={{ fontSize: 12, marginTop: 6 }}>
              Isi saldo awal sesuai saldo rekening sebelum catatan pertama di Artha.
            </p>
          </Field>
        </form>
      </Sheet>

      {/* ── Konfirmasi Hapus Rekening ────────────────── */}
      <ConfirmDialog
        open={confirmAcc !== null}
        title="Hapus Rekening"
        message={confirmAcc ? `Hapus rekening "${confirmAcc.name}"?` : ''}
        confirmLabel="Hapus"
        onConfirm={confirmDeleteAcc}
        onCancel={() => setConfirmAcc(null)}
      />

      {/* ── Rekening tidak bisa dihapus ──────────────── */}
      <ConfirmDialog
        open={blockedAcc !== null}
        title={blockedAcc ? `Tidak bisa menghapus ${blockedAcc.name}` : 'Tidak bisa menghapus'}
        message={blockedAcc?.message ?? ''}
        confirmLabel="Mengerti"
        onConfirm={() => setBlockedAcc(null)}
        onCancel={() => setBlockedAcc(null)}
      />

      {/* ── Konfirmasi hapus kategori/platform/aset ──── */}
      <ConfirmDialog
        open={confirmDel !== null}
        title="Hapus"
        message={confirmDel ? `Hapus "${confirmDel.label}"?` : ''}
        confirmLabel="Hapus"
        onConfirm={() => {
          if (confirmDel) {
            remove(confirmDel.table, confirmDel.id)
            setConfirmDel(null)
          }
        }}
        onCancel={() => setConfirmDel(null)}
      />

      {/* ── Aset tidak bisa dihapus ───────────────────── */}
      <ConfirmDialog
        open={blockedAsset !== null}
        title={blockedAsset ? `Tidak bisa menghapus ${blockedAsset.name}` : 'Tidak bisa menghapus'}
        message={blockedAsset?.message ?? ''}
        confirmLabel="Mengerti"
        onConfirm={() => setBlockedAsset(null)}
        onCancel={() => setBlockedAsset(null)}
      />

      {/* ── Edit Kontributor ─────────────────────────── */}
      <Sheet
        open={editingContrib !== null}
        onClose={closeEditContrib}
        title="Ubah Kontributor"
        footer={
          <>
            <button type="button" className="btn-ghost" onClick={closeEditContrib}>
              Batal
            </button>
            <button type="submit" form="edit-contrib-form" className="btn">
              Simpan
            </button>
          </>
        }
      >
        <form
          id="edit-contrib-form"
          onSubmit={submitEditContrib}
          style={{ display: 'flex', flexDirection: 'column', gap: 14 }}
        >
          <Field label="Nama" htmlFor="edit-contrib-name" error={editContribError ?? undefined}>
            <input
              id="edit-contrib-name"
              className="input"
              value={editContribName}
              onChange={(e) => { setEditContribName(e.target.value); setEditContribError(null) }}
              autoFocus
            />
          </Field>
        </form>
      </Sheet>

      {/* ── Konfirmasi Hapus Kontributor ──────────────── */}
      <ConfirmDialog
        open={confirmDelContrib !== null}
        title="Hapus Kontributor"
        message={confirmDelContrib ? `Hapus kontributor "${confirmDelContrib.name}"?` : ''}
        confirmLabel="Hapus"
        onConfirm={confirmDeleteContrib}
        onCancel={() => setConfirmDelContrib(null)}
      />

      {/* ── Kontributor tidak bisa dihapus ───────────── */}
      <ConfirmDialog
        open={blockedContrib !== null}
        title={blockedContrib ? `Tidak bisa menghapus ${blockedContrib.name}` : 'Tidak bisa menghapus'}
        message={blockedContrib?.message ?? ''}
        confirmLabel="Mengerti"
        onConfirm={() => setBlockedContrib(null)}
        onCancel={() => setBlockedContrib(null)}
      />
    </div>
  )
}
