import { useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'

export default function Login() {
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ type: 'error' | 'info'; text: string } | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setMsg(null)
    if (mode === 'login') {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) setMsg({ type: 'error', text: error.message })
    } else {
      const { data, error } = await supabase.auth.signUp({ email, password })
      if (error) setMsg({ type: 'error', text: error.message })
      else if (!data.session)
        setMsg({ type: 'info', text: 'Akun dibuat. Cek email untuk konfirmasi, lalu masuk.' })
    }
    setBusy(false)
  }

  return (
    <div
      style={{
        minHeight: '100dvh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        backgroundColor: 'var(--bg)',
      }}
    >
      {/* Brand */}
      <div style={{ marginBottom: 32, textAlign: 'center' }}>
        <div
          style={{
            width: 64,
            height: 64,
            borderRadius: 20,
            background: 'var(--primary)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 16px',
          }}
          aria-hidden="true"
        >
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 26,
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
            fontSize: 28,
            color: 'var(--text-1)',
            letterSpacing: '-0.02em',
            marginBottom: 6,
          }}
        >
          Artha
        </h1>
        <p className="muted" style={{ maxWidth: 280, margin: '0 auto' }}>
          Pemasukan, pengeluaran, dan investasi di satu tempat.
        </p>
      </div>

      {/* Card */}
      <div className="card" style={{ width: '100%', maxWidth: 400, padding: 28 }}>
        {/* Tab */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            background: 'var(--surface-2)',
            borderRadius: 'var(--radius-md)',
            padding: 3,
            marginBottom: 24,
          }}
        >
          {(['login', 'signup'] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => { setMode(m); setMsg(null) }}
              style={{
                padding: '8px 16px',
                borderRadius: 'calc(var(--radius-md) - 2px)',
                border: 'none',
                background: mode === m ? 'var(--surface)' : 'transparent',
                color: mode === m ? 'var(--text-1)' : 'var(--text-3)',
                fontFamily: 'inherit',
                fontSize: 14,
                fontWeight: mode === m ? 600 : 400,
                cursor: 'pointer',
                transition: 'all 150ms ease-out',
                boxShadow: mode === m ? 'var(--shadow-sm)' : 'none',
              }}
            >
              {m === 'login' ? 'Masuk' : 'Daftar'}
            </button>
          ))}
        </div>

        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label className="label" htmlFor="login-email">Email</label>
            <input
              id="login-email"
              type="email"
              autoComplete="email"
              required
              className="input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div>
            <label className="label" htmlFor="login-pw">Kata sandi</label>
            <input
              id="login-pw"
              type="password"
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              minLength={8}
              required
              className="input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          {msg && (
            <p
              style={{
                fontSize: 13,
                color: msg.type === 'error' ? 'var(--expense)' : 'var(--income)',
                lineHeight: 1.5,
              }}
            >
              {msg.text}
            </p>
          )}

          <button
            type="submit"
            className="btn"
            disabled={busy}
            style={{ marginTop: 4 }}
          >
            {busy
              ? 'Memproses...'
              : mode === 'login'
                ? 'Masuk'
                : 'Buat Akun'}
          </button>
        </form>
      </div>

      <p className="muted" style={{ marginTop: 20, fontSize: 12 }}>
        Artha menyimpan data di perangkatmu dan Supabase (RLS aktif).
      </p>
    </div>
  )
}
