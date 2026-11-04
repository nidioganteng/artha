import { useEffect, useRef, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { AnimatePresence, m, useReducedMotion } from 'motion/react'
import {
  LayoutDashboard,
  ArrowLeftRight,
  TrendingUp,
  RefreshCw,
  BarChart2,
  Settings as SettingsIcon,
  Sun,
  Moon,
  Monitor,
  LogOut,
} from 'lucide-react'
import { configured, supabase } from './lib/supabase'
import { StoreProvider, useStore } from './lib/store'
import { ThemeProvider, useTheme } from './lib/theme'
import { useMode } from './lib/useMode'
import { SyncBadge } from './ui/SyncBadge'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Transactions from './pages/Transactions'
import Investments from './pages/Investments'
import Recurring from './pages/Recurring'
import Report from './pages/Report'
import Settings from './pages/Settings'

// Semua tab yang mungkin muncul di sidebar/rail (>= md).
const ALL_SIDE_TABS = [
  { id: 'home', label: 'Ringkasan',  Icon: LayoutDashboard },
  { id: 'tx',   label: 'Transaksi',  Icon: ArrowLeftRight },
  { id: 'inv',  label: 'Investasi',  Icon: TrendingUp },
  { id: 'rec',  label: 'Rutin',      Icon: RefreshCw },
  { id: 'lap',  label: 'Laporan',    Icon: BarChart2 },
  { id: 'set',  label: 'Pengaturan', Icon: SettingsIcon },
] as const

// Semua tab yang mungkin muncul di bottom tab bar (mobile, tidak termasuk Laporan).
const ALL_TABS = [
  { id: 'home', label: 'Ringkasan',  Icon: LayoutDashboard },
  { id: 'tx',   label: 'Transaksi',  Icon: ArrowLeftRight },
  { id: 'inv',  label: 'Investasi',  Icon: TrendingUp },
  { id: 'rec',  label: 'Rutin',      Icon: RefreshCw },
  { id: 'set',  label: 'Pengaturan', Icon: SettingsIcon },
] as const

// Tab yang disembunyikan di mode investasi
const INVEST_HIDDEN: string[] = ['tx', 'lap']
const INVEST_HIDDEN_MOBILE: string[] = ['tx']

type Tab = (typeof ALL_SIDE_TABS)[number]['id']

function tabFromHash(validTabs: readonly { id: string }[]): Tab {
  const h = window.location.hash.replace('#', '')
  return (validTabs.find((t) => t.id === h)?.id ?? 'home') as Tab
}

function ModeToggle() {
  const { mode, setMode } = useTheme()
  const next =
    mode === 'light' ? 'dark' : mode === 'dark' ? 'system' : 'light'
  const Icon = mode === 'light' ? Sun : mode === 'dark' ? Moon : Monitor
  const label =
    mode === 'light'
      ? 'Beralih ke mode gelap'
      : mode === 'dark'
        ? 'Beralih ke mode sistem'
        : 'Beralih ke mode terang'
  return (
    <button
      className="btn-ghost"
      style={{ padding: 8, minHeight: 44, minWidth: 44, border: 'none' }}
      onClick={() => setMode(next)}
      aria-label={label}
      title={label}
    >
      <Icon size={18} />
    </button>
  )
}

function Shell({ onLogout }: { onLogout: () => void }) {
  const [focusFailed, setFocusFailed] = useState(false)
  const { ready, online, db, save, userId } = useStore()
  const { mode: accountMode } = useMode()
  const shouldReduceMotion = useReducedMotion()

  // Filter tab berdasarkan mode akun
  const sideTabs = ALL_SIDE_TABS.filter((t) =>
    accountMode === 'investasi' ? !INVEST_HIDDEN.includes(t.id) : true,
  )
  const mobileTabs = ALL_TABS.filter((t) =>
    accountMode === 'investasi' ? !INVEST_HIDDEN_MOBILE.includes(t.id) : true,
  )

  const [tab, setTab] = useState<Tab>(() => tabFromHash(sideTabs))

  // Pastikan tab aktif valid untuk mode saat ini
  useEffect(() => {
    if (accountMode === 'investasi' && (tab === 'tx' || tab === 'lap')) {
      go('inv')
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountMode, tab])

  useEffect(() => {
    const on = () => {
      const h = window.location.hash.replace('#', '')
      const validId = sideTabs.find((t) => t.id === h)?.id
      if (validId) setTab(validId as Tab)
      else setTab('home')
    }
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sideTabs])

  // Buat baris profiles jika belum ada setelah store siap (akun lama tanpa migrasi).
  const profileCreatedRef = useRef(false)
  useEffect(() => {
    if (ready && db.profiles.length === 0 && !profileCreatedRef.current) {
      profileCreatedRef.current = true
      save('profiles', { id: userId, mode: 'lengkap', mode_locked: false })
    }
  }, [ready, db.profiles.length, save, userId])

  const go = (t: Tab) => {
    window.location.hash = t
    setTab(t)
    window.scrollTo({ top: 0 })
  }

  const goSettings = () => {
    setFocusFailed(true)
    go('set')
    setTimeout(() => setFocusFailed(false), 1000)
  }

  return (
    <div
      data-testid={ready ? 'shell-ready' : 'shell-loading'}
      data-account-mode={accountMode}
      style={{
        display: 'flex',
        flexDirection: 'column',
        minHeight: '100dvh',
        backgroundColor: 'var(--bg)',
      }}
    >
      {/* ── Skip link — aksesibilitas keyboard ── */}
      <a href="#main-content" className="skip-link">
        Langsung ke konten
      </a>

      {/* ── Header — all sizes, single ModeToggle here ── */}
      <header
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 'var(--z-header)' as unknown as number,
          height: 'var(--header-h)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 16px',
          backgroundColor: 'var(--surface)',
          borderBottom: '1px solid var(--border)',
          flexShrink: 0,
          transition: 'background-color 0.25s ease, border-color 0.25s ease',
        }}
      >
        <span
          style={{
            fontSize: 18,
            fontWeight: 700,
            letterSpacing: '-0.02em',
            color: 'var(--text-1)',
          }}
        >
          Artha
        </span>
        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          {/* SyncBadge di header hanya muncul di bawah lg (md ke bawah); lg+ pakai yang ada di sidebar */}
          <div className="lg:hidden">
            <SyncBadge onGoSettings={goSettings} />
          </div>
          <ModeToggle />
        </div>
      </header>

      {/* ── Body row ── */}
      <div style={{ display: 'flex', flex: 1 }}>

        {/* ── Sidebar / Rail — single nav, hidden md:flex ──
            md (768-1023px): 72px rail, ikon saja + tooltip
            lg (1024px+):    224px sidebar, ikon + label
            Kelas nav-side di index.css mengatur lebar & padding.
            Tidak ada display di inline style → md:hidden pada tab bar
            tidak akan ditimpa. ── */}
        <nav
          className="hidden md:flex nav-side"
          aria-label="Navigasi"
          style={{
            flexDirection: 'column',
            flexShrink: 0,
            position: 'sticky',
            top: 'var(--header-h)',
            height: 'calc(100dvh - var(--header-h))',
            overflowY: 'auto',
            overflowX: 'hidden',
            backgroundColor: 'var(--surface)',
            borderRight: '1px solid var(--border)',
            transition: 'background-color 0.25s ease',
          }}
        >
          {sideTabs.map(({ id, label, Icon }) => {
            const active = tab === id
            return (
              <button
                key={id}
                onClick={() => go(id as Tab)}
                title={label}
                aria-label={label}
                aria-current={active ? 'page' : undefined}
                className="nav-side-btn"
                style={{
                  background: active ? 'var(--primary)' : 'transparent',
                  color: active ? 'var(--primary-fg)' : 'var(--text-2)',
                  fontWeight: active ? 600 : 500,
                }}
              >
                <Icon size={20} />
                <span className="hidden lg:block" style={{ fontSize: 14 }}>
                  {label}
                </span>
              </button>
            )
          })}

          {/* Nav bottom: SyncBadge (só lg) + logout */}
          <div
            style={{
              marginTop: 'auto',
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
              paddingTop: 16,
              paddingBottom: 8,
            }}
          >
            <div className="hidden lg:block" style={{ paddingBottom: 4 }}>
              <SyncBadge onGoSettings={goSettings} />
            </div>
            <button
              className="nav-side-btn btn-ghost"
              onClick={onLogout}
              title="Keluar"
              aria-label="Keluar"
              style={{
                border: 'none',
                color: 'var(--text-2)',
                fontWeight: 500,
                fontSize: 14,
              }}
            >
              <LogOut size={18} />
              <span className="hidden lg:block">Keluar</span>
            </button>
          </div>
        </nav>

        {/* ── Main content ── */}
        <main
          id="main-content"
          className="pb-[calc(var(--tabbar-h)+env(safe-area-inset-bottom)+16px)] md:pb-5 lg:px-8 lg:pt-8"
          style={{
            flex: 1,
            minWidth: 0,
            padding: '20px 16px',
            maxWidth: 1160,
            width: '100%',
            marginLeft: 'auto',
            marginRight: 'auto',
          }}
        >
          {!ready ? (
            <div className="card">
              <p className="muted">Memuat data...</p>
              {!online && (
                <p className="muted" style={{ marginTop: 8 }}>
                  Perangkat offline. Data akan dimuat setelah terhubung.
                </p>
              )}
            </div>
          ) : (
            <AnimatePresence mode="wait" initial={false}>
              <m.div
                key={tab}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: shouldReduceMotion ? 0 : 0.18, ease: 'easeOut' }}
              >
                {tab === 'home' && <Dashboard goto={(t) => go(t as Tab)} />}
                {tab === 'tx' && accountMode === 'lengkap' && <Transactions />}
                {tab === 'inv' && <Investments />}
                {tab === 'rec' && <Recurring />}
                {tab === 'lap' && accountMode === 'lengkap' && <Report goto={(t) => go(t as Tab)} />}
                {tab === 'set' && <Settings onLogout={onLogout} focusFailed={focusFailed} />}
              </m.div>
            </AnimatePresence>
          )}
        </main>
      </div>

      {/* ── Bottom Tab Bar — mobile only (<768px) ──
          Gunakan HANYA kelas Tailwind untuk layout (grid, fixed, inset, z-index, min-h).
          TIDAK ada display di inline style — md:hidden akan bekerja. ── */}
      <nav
        className="md:hidden fixed inset-x-0 bottom-0 z-[var(--z-nav)] min-h-[var(--tabbar-h)]"
        aria-label="Navigasi bawah"
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${mobileTabs.length}, 1fr)`,
          backgroundColor: 'var(--surface)',
          borderTop: '1px solid var(--border)',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          paddingBottom: 'env(safe-area-inset-bottom)',
          transition: 'background-color 0.25s ease',
        }}
      >
        {mobileTabs.map(({ id, label, Icon }) => {
          const active = tab === id
          return (
            <button
              key={id}
              onClick={() => go(id as Tab)}
              aria-label={label}
              aria-current={active ? 'page' : undefined}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 3,
                width: '100%',
                minHeight: 64,
                padding: '8px 4px 4px',
                border: 'none',
                cursor: 'pointer',
                background: 'transparent',
                fontFamily: 'inherit',
              }}
            >
              {/* Pill hanya membungkus ikon — lebar tetap, tidak memengaruhi lebar label */}
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 40,
                  height: 26,
                  borderRadius: 'var(--radius-xl)',
                  background: active ? 'var(--primary)' : 'transparent',
                  color: active ? 'var(--primary-fg)' : 'var(--text-3)',
                  transition: 'background 150ms ease-out, color 150ms ease-out',
                  flexShrink: 0,
                }}
              >
                <Icon size={18} />
              </span>
              {/* Label di luar pill supaya bisa menggunakan lebar penuh sel */}
              <span
                style={{
                  fontSize: 11,
                  fontWeight: active ? 600 : 400,
                  lineHeight: 1.2,
                  color: active ? 'var(--primary)' : 'var(--text-3)',
                  transition: 'color 150ms ease-out',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  maxWidth: '95%',
                }}
              >
                {label}
              </span>
            </button>
          )
        })}
      </nav>
    </div>
  )
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!configured) {
      setLoading(false)
      return
    }
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
    })
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => data.subscription.unsubscribe()
  }, [])

  // Mode pratinjau: render Shell tanpa auth (hanya saat VITE_SHELL_PREVIEW=true)
  if (import.meta.env.VITE_SHELL_PREVIEW === 'true') {
    return (
      <ThemeProvider>
        <StoreProvider userId="__preview__">
          <Shell onLogout={() => {}} />
        </StoreProvider>
      </ThemeProvider>
    )
  }

  if (!configured)
    return (
      <ThemeProvider>
        <div style={{ maxWidth: 512, margin: '0 auto', padding: 24 }}>
          <div className="card">
            <h1 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>
              Supabase belum dikonfigurasi
            </h1>
            <p className="muted">
              Salin <code>.env.example</code> menjadi <code>.env.local</code>, isi{' '}
              <code>VITE_SUPABASE_URL</code> dan <code>VITE_SUPABASE_ANON_KEY</code>, lalu
              jalankan ulang <code>npm run dev</code>.
            </p>
          </div>
        </div>
      </ThemeProvider>
    )

  if (loading)
    return (
      <ThemeProvider>
        <div style={{ padding: 24 }}>
          <p className="muted">Memuat...</p>
        </div>
      </ThemeProvider>
    )

  if (!session)
    return (
      <ThemeProvider>
        <Login />
      </ThemeProvider>
    )

  function clearLocalCache(userId: string) {
    for (const suffix of ['cache', 'queue', 'failed']) {
      localStorage.removeItem(`kq:${suffix}:${userId}`)
    }
  }

  const logout = async () => {
    const { data } = await supabase.auth.getSession()
    const uid = data.session?.user?.id
    await supabase.auth.signOut()
    if (uid) clearLocalCache(uid)
  }

  return (
    <ThemeProvider>
      <StoreProvider key={session.user.id} userId={session.user.id}>
        <Shell onLogout={logout} />
      </StoreProvider>
    </ThemeProvider>
  )
}
