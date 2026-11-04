import { useStore } from './store'
import type { AccountMode } from './types'

export type { AccountMode }

export interface ModeContext {
  mode: AccountMode
  modeLocked: boolean
  setMode: (m: AccountMode) => void
  setModeLocked: (v: boolean) => void
}

export function useMode(): ModeContext {
  const { db, save, userId } = useStore()
  const profile = db.profiles?.[0]
  const mode: AccountMode = (profile?.mode as AccountMode) ?? 'lengkap'
  const modeLocked: boolean = (profile?.mode_locked as boolean) ?? false

  const setMode = (m: AccountMode) => {
    save('profiles', { id: userId, mode: m, mode_locked: modeLocked })
  }

  const setModeLocked = (v: boolean) => {
    save('profiles', { id: userId, mode, mode_locked: v })
  }

  return { mode, modeLocked, setMode, setModeLocked }
}
