import { useEffect, useRef, useState, type FormEvent } from 'react'
import { LazyMotion, domAnimation, m, useReducedMotion } from 'motion/react'
import { Eye, EyeOff, Moon, Sun, SunMoon } from 'lucide-react'
import LoginScene from './LoginScene'
import { supabase } from '../lib/supabase'
import { useTheme, type Palette } from '../lib/theme'

function humanizeError(msg: string): string {
  const lower = msg.toLowerCase()
  if (lower.includes('invalid login credentials') || lower.includes('wrong password') || lower.includes('invalid credentials'))
    return 'Email atau kata sandi salah. Periksa kembali.'
  if (lower.includes('email not confirmed'))
    return 'Email belum dikonfirmasi. Cek kotak masuk untuk tautan konfirmasi.'
  if (lower.includes('signups not allowed') || lower.includes('signup is disabled') || lower.includes('signup_disabled'))
    return 'Pendaftaran sedang ditutup.'
  if (lower.includes('too many requests') || lower.includes('rate limit') || lower.includes('too many'))
    return 'Terlalu banyak percobaan. Tunggu beberapa menit lalu coba lagi.'
  if (lower.includes('network') || lower.includes('fetch') || lower.includes('failed to fetch'))
    return 'Gagal terhubung ke server. Periksa koneksi internet.'
  if (lower.includes('user already registered') || lower.includes('already registered'))
    return 'Email sudah terdaftar. Coba masuk.'
  if (lower.includes('password') && lower.includes('weak'))
    return 'Kata sandi terlalu lemah. Gunakan minimal 8 karakter.'
  return 'Terjadi kendala. Silakan coba lagi.'
}

function ThemeToggle() {
  const { mode, setMode, palette, setPalette } = useTheme()
  const cycleMode = () => {
    const order: import('../lib/theme').Mode[] = ['system', 'light', 'dark']
    setMode(order[(order.indexOf(mode) + 1) % order.length])
  }
  const icon =
    mode === 'light' ? <Sun size={15} /> : mode === 'dark' ? <Moon size={15} /> : <SunMoon size={15} />
  const label =
    mode === 'light' ? 'Mode terang' : mode === 'dark' ? 'Mode gelap' : 'Ikut sistem'

  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
      <div style={{ display: 'flex', gap: 4 }} role="group" aria-label="Pilih palet warna">
        {(['a', 'b'] as Palette[]).map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => setPalette(p)}
            aria-pressed={palette === p}
            aria-label={`Palet ${p === 'a' ? 'A Lime' : 'B Sage'}`}
            style={{
              width: 44,
              height: 44,
              borderRadius: '50%',
              border: `2px solid ${palette === p ? 'var(--primary)' : 'var(--border)'}`,
              background: 'var(--surface-2)',
              color: 'var(--text-1)',
              cursor: 'pointer',
              padding: 0,
              transition: 'border-color 150ms ease-out',
              flexShrink: 0,
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            {p.toUpperCase()}
          </button>
        ))}
      </div>

      <button
        type="button"
        onClick={cycleMode}
        aria-label={label}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 44,
          height: 44,
          borderRadius: 'var(--radius-sm)',
          border: '1px solid var(--border)',
          background: 'color-mix(in srgb, var(--surface) 80%, transparent)',
          color: 'var(--text-2)',
          cursor: 'pointer',
          backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)',
        }}
      >
        {icon}
      </button>
    </div>
  )
}

export default function Login() {
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ type: 'error' | 'info'; text: string } | null>(null)

  const [tilt, setTilt] = useState({ x: 0, y: 0 })
  const reduced = useReducedMotion()
  const [saveData] = useState(
    () => !!(navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData,
  )

  // Jeda animasi saat tab tersembunyi
  useEffect(() => {
    const onVis = () => {
      document.querySelectorAll<HTMLElement>('[data-floatcard]').forEach((el) => {
        el.style.animationPlayState = document.hidden ? 'paused' : 'running'
      })
    }
    onVis()
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [])

  // Paralaks pointer — hanya fine pointer, tidak di perangkat save-data
  const sceneRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (reduced || saveData) return
    const mq = window.matchMedia('(hover: hover) and (pointer: fine)')
    if (!mq.matches) return
    const onMove = (e: PointerEvent) => {
      const el = sceneRef.current
      if (!el || document.hidden) return
      const rect = el.getBoundingClientRect()
      const cx = ((e.clientX - rect.left) / rect.width - 0.5) * 2
      const cy = ((e.clientY - rect.top) / rect.height - 0.5) * 2
      setTilt({ x: Math.max(-3, Math.min(3, cy * -3)), y: Math.max(-6, Math.min(6, cx * 6)) })
    }
    const onLeave = () => setTilt({ x: 0, y: 0 })
    window.addEventListener('pointermove', onMove)
    window.addEventListener('blur', onLeave)
    sceneRef.current?.addEventListener('pointerleave', onLeave)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('blur', onLeave)
    }
  }, [reduced, saveData])

  // Scroll input ke tengah saat keyboard HP terbuka
  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return
    const onResize = () => {
      const active = document.activeElement
      if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')) {
        active.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }
    }
    vv.addEventListener('resize', onResize)
    return () => vv.removeEventListener('resize', onResize)
  }, [])

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (busy) return
    setBusy(true)
    setMsg(null)
    try {
      if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) setMsg({ type: 'error', text: humanizeError(error.message) })
      } else {
        const { data, error } = await supabase.auth.signUp({ email, password })
        if (error) setMsg({ type: 'error', text: humanizeError(error.message) })
        else if (!data.session)
          setMsg({ type: 'info', text: 'Akun dibuat. Cek email untuk tautan konfirmasi, lalu masuk.' })
      }
    } catch {
      setMsg({ type: 'error', text: 'Gagal terhubung ke server. Periksa koneksi internet.' })
    }
    setBusy(false)
  }

  return (
    <LazyMotion features={domAnimation}>
      <style>{`
        @media (prefers-reduced-motion: reduce) {
          [data-floatcard] { animation: none !important; }
        }
        /* Sembunyikan adegan 3D di layar sempit agar tidak menimpa kartu form */
        @media (max-width: 899px) {
          .login-scene { display: none !important; }
        }
      `}</style>

      {/* Latar layar penuh + adegan 3D */}
      <div
        ref={sceneRef}
        data-save-data={saveData || undefined}
        aria-hidden="true"
        style={{ position: 'fixed', inset: 0, background: 'var(--bg)', overflow: 'hidden' }}
      >
        <div className="login-scene" style={{ position: 'absolute', inset: 0 }}>
          <LoginScene tiltX={tilt.x} tiltY={tilt.y} reduced={!!reduced || saveData} />
        </div>
      </div>

      {/* Tombol tema di pojok kanan atas */}
      <div
        style={{
          position: 'fixed',
          top: 'calc(12px + env(safe-area-inset-top))',
          right: 16,
          zIndex: 'var(--z-header)' as unknown as number,
        }}
      >
        <ThemeToggle />
      </div>

      {/* Konten tengah — kartu form */}
      <div
        style={{
          position: 'fixed',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 'max(60px, calc(env(safe-area-inset-top) + 20px)) 16px max(24px, env(safe-area-inset-bottom))',
          overflowY: 'auto',
          WebkitOverflowScrolling: 'touch',
        }}
      >
        <m.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: reduced ? 0 : 0.4, ease: 'easeOut' }}
          style={{
            width: '100%',
            maxWidth: 400,
            display: 'flex',
            flexDirection: 'column',
            gap: 0,
          }}
        >
          {/* Brand */}
          <div style={{ marginBottom: 28, textAlign: 'center' }}>
            <div
              aria-hidden="true"
              style={{
                width: 60,
                height: 60,
                borderRadius: 18,
                background: 'var(--primary)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 14px',
                boxShadow: 'var(--shadow-md)',
              }}
            >
              <span
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 24,
                  fontWeight: 700,
                  color: 'var(--primary-fg)',
                  letterSpacing: '-0.03em',
                }}
              >
                A
              </span>
            </div>
            <h1
              style={{
                fontWeight: 700,
                fontSize: 26,
                color: 'var(--text-1)',
                letterSpacing: '-0.02em',
                marginBottom: 6,
              }}
            >
              Artha
            </h1>
            <p className="muted" style={{ maxWidth: 260, margin: '0 auto', fontSize: 14 }}>
              Pemasukan, pengeluaran, dan investasi di satu tempat.
            </p>
          </div>

          {/* Kartu form dengan kaca */}
          <div
            style={{
              background: 'var(--glass-bg)',
              backdropFilter: 'blur(20px)',
              WebkitBackdropFilter: 'blur(20px)',
              border: '1px solid var(--glass-border)',
              borderRadius: 'var(--radius-xl)',
              padding: '24px 24px 20px',
              boxShadow: 'var(--shadow-lg)',
            }}
          >
            {/* Tab Masuk / Daftar */}
            <div
              role="tablist"
              aria-label="Mode masuk atau daftar"
              onKeyDown={(e) => {
                if (e.key === 'ArrowLeft') { setMode('login'); setMsg(null) }
                else if (e.key === 'ArrowRight') { setMode('signup'); setMsg(null) }
              }}
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                background: 'color-mix(in srgb, var(--surface-2) 60%, transparent)',
                borderRadius: 'var(--radius-full)',
                padding: 3,
                marginBottom: 20,
              }}
            >
              {(['login', 'signup'] as const).map((m) => {
                const active = mode === m
                return (
                  <button
                    key={m}
                    role="tab"
                    aria-selected={active}
                    type="button"
                    onClick={() => { setMode(m); setMsg(null) }}
                    style={{
                      minHeight: 44,
                      borderRadius: 'calc(var(--radius-full) - 2px)',
                      border: 'none',
                      background: active ? 'var(--surface)' : 'transparent',
                      color: active ? 'var(--text-1)' : 'var(--text-3)',
                      fontWeight: active ? 600 : 400,
                      fontSize: 13,
                      cursor: 'pointer',
                      transition: 'background 150ms ease-out, color 150ms ease-out',
                      boxShadow: active ? 'var(--shadow-sm)' : 'none',
                      fontFamily: 'var(--font-ui)',
                    }}
                  >
                    {m === 'login' ? 'Masuk' : 'Daftar'}
                  </button>
                )
              })}
            </div>

            {/* Form */}
            <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label className="label" htmlFor="login-email">Email</label>
                <input
                  id="login-email"
                  type="email"
                  autoComplete={mode === 'login' ? 'username' : 'email'}
                  name={mode === 'login' ? 'username' : 'email'}
                  inputMode="email"
                  required
                  className="input"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>

              <div>
                <label className="label" htmlFor="login-pw">Kata sandi</label>
                <div style={{ position: 'relative' }}>
                  <input
                    id="login-pw"
                    type={showPw ? 'text' : 'password'}
                    autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                    minLength={mode === 'signup' ? 8 : undefined}
                    required
                    className="input"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    style={{ paddingRight: 48 }}
                  />
                  <button
                    type="button"
                    aria-label={showPw ? 'Sembunyikan kata sandi' : 'Tampilkan kata sandi'}
                    onClick={() => setShowPw((v) => !v)}
                    style={{
                      position: 'absolute',
                      right: 2,
                      top: '50%',
                      transform: 'translateY(-50%)',
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      color: 'var(--text-3)',
                      padding: 4,
                      display: 'flex',
                      alignItems: 'center',
                      minHeight: 44,
                      minWidth: 44,
                      justifyContent: 'center',
                    }}
                  >
                    {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              {/* Area pesan inline — hanya muncul saat ada pesan */}
              {msg && (
                <div
                  role="alert"
                  aria-live="polite"
                  style={{
                    fontSize: 13,
                    color: msg.type === 'error' ? 'var(--expense)' : 'var(--income)',
                    lineHeight: 1.45,
                    padding: '8px 12px',
                    borderRadius: 'var(--radius-sm)',
                    background: msg.type === 'error'
                      ? 'color-mix(in srgb, var(--expense) 10%, transparent)'
                      : 'color-mix(in srgb, var(--income) 10%, transparent)',
                  }}
                >
                  {msg.text}
                </div>
              )}

              <button
                type="submit"
                className="btn"
                disabled={busy}
                style={{ width: '100%', gap: 8 }}
              >
                {busy && (
                  <svg
                    aria-hidden="true"
                    width="16"
                    height="16"
                    viewBox="0 0 16 16"
                    style={{ animation: 'spin 0.7s linear infinite', flexShrink: 0 }}
                  >
                    <style>{'@keyframes spin{to{transform:rotate(360deg)}}'}</style>
                    <circle
                      cx="8" cy="8" r="6"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeDasharray="28"
                      strokeDashoffset="8"
                      strokeLinecap="round"
                    />
                  </svg>
                )}
                {busy ? 'Memproses...' : mode === 'login' ? 'Masuk' : 'Daftar'}
              </button>
            </form>

            <p style={{ marginTop: 16, fontSize: 12, color: 'var(--text-3)', textAlign: 'center', lineHeight: 1.5 }}>
              Catatanmu tersimpan di perangkat dan akun pribadi. Hanya kamu yang dapat mengaksesnya.
            </p>
          </div>
        </m.div>
      </div>
    </LazyMotion>
  )
}
