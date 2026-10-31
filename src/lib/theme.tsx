import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'

export type Palette = 'a' | 'b'
export type Mode    = 'system' | 'light' | 'dark'
export type Theme   = 'light' | 'dark'

interface ThemeCtx {
  palette: Palette
  mode: Mode
  theme: Theme
  setPalette: (p: Palette) => void
  setMode: (m: Mode) => void
}

const Ctx = createContext<ThemeCtx | null>(null)

const BG: Record<Palette, Record<Theme, string>> = {
  a: { light: '#F1F3EF', dark: '#0B1910' },
  b: { light: '#F4F1EB', dark: '#18140F' },
}

function resolveTheme(mode: Mode): Theme {
  if (mode === 'system') return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  return mode
}

function applyToDOM(palette: Palette, theme: Theme) {
  const el = document.documentElement
  el.setAttribute('data-palette', palette)
  el.setAttribute('data-theme', theme)
  const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')
  if (meta) meta.setAttribute('content', BG[palette][theme])
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [palette, setPaletteState] = useState<Palette>(
    () => (localStorage.getItem('artha:palette') as Palette) || 'b',
  )
  const [mode, setModeState] = useState<Mode>(
    () => (localStorage.getItem('artha:mode') as Mode) || 'system',
  )
  const [theme, setThemeState] = useState<Theme>(() =>
    resolveTheme((localStorage.getItem('artha:mode') as Mode) || 'system'),
  )

  useEffect(() => {
    applyToDOM(palette, theme)
  }, [palette, theme])

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = () => {
      if (mode === 'system') {
        const t = resolveTheme('system')
        setThemeState(t)
        applyToDOM(palette, t)
      }
    }
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [mode, palette])

  const setPalette = (p: Palette) => {
    localStorage.setItem('artha:palette', p)
    setPaletteState(p)
    applyToDOM(p, theme)
  }

  const setMode = (m: Mode) => {
    localStorage.setItem('artha:mode', m)
    setModeState(m)
    const t = resolveTheme(m)
    setThemeState(t)
    applyToDOM(palette, t)
  }

  return (
    <Ctx.Provider value={{ palette, mode, theme, setPalette, setMode }}>
      {children}
    </Ctx.Provider>
  )
}

export function useTheme(): ThemeCtx {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useTheme harus digunakan di dalam ThemeProvider')
  return ctx
}
