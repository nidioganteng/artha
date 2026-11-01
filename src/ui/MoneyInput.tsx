import { useCallback, useEffect, useRef, useState, type ChangeEvent, type ClipboardEvent, type FocusEvent } from 'react'
import { formatMoneyInput, parseMoneyInput } from '../lib/numInput'

export interface MoneyInputProps {
  id?: string
  value: number | null
  onValueChange: (value: number | null) => void
  placeholder?: string
  disabled?: boolean
  autoFocus?: boolean
}

function toDisplay(v: number | null): string {
  return v == null ? '' : formatMoneyInput(String(Math.round(v)))
}

export function MoneyInput({ id, value, onValueChange, placeholder = '50.000', disabled, autoFocus }: MoneyInputProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const focusedRef = useRef(false)
  const [display, setDisplay] = useState(() => toDisplay(value))

  // Sinkron dari prop saat tidak sedang diketik
  useEffect(() => {
    if (!focusedRef.current) {
      setDisplay(toDisplay(value))
    }
  }, [value])

  const handleChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    const input = e.target
    const cursorPos = input.selectionStart ?? 0
    const rawVal = input.value

    // Hitung digit sebelum kursor (tanpa titik)
    const digitsBeforeCursor = rawVal.slice(0, cursorPos).replace(/[^\d]/g, '').length

    // Format
    const newDisplay = formatMoneyInput(rawVal)

    setDisplay(newDisplay)
    onValueChange(parseMoneyInput(newDisplay))

    // Kembalikan posisi kursor setelah React render ulang
    requestAnimationFrame(() => {
      const el = inputRef.current
      if (!el) return
      if (digitsBeforeCursor === 0) {
        el.setSelectionRange(0, 0)
        return
      }
      let count = 0
      let pos = newDisplay.length
      for (let i = 0; i < newDisplay.length; i++) {
        if (/\d/.test(newDisplay[i])) count++
        if (count === digitsBeforeCursor) { pos = i + 1; break }
      }
      el.setSelectionRange(pos, pos)
    })
  }, [onValueChange])

  const handleFocus = useCallback(() => {
    focusedRef.current = true
  }, [])

  const handleBlur = useCallback((e: FocusEvent<HTMLInputElement>) => {
    focusedRef.current = false
    const formatted = formatMoneyInput(e.target.value)
    setDisplay(formatted)
    onValueChange(parseMoneyInput(formatted))
  }, [onValueChange])

  const handlePaste = useCallback((e: ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault()
    const text = e.clipboardData.getData('text')
    const formatted = formatMoneyInput(text)
    setDisplay(formatted)
    onValueChange(parseMoneyInput(formatted))
    requestAnimationFrame(() => {
      const el = inputRef.current
      if (el) el.setSelectionRange(formatted.length, formatted.length)
    })
  }, [onValueChange])

  return (
    <div className="money-input-wrap">
      <span className="money-input-prefix" aria-hidden="true">Rp</span>
      <input
        ref={inputRef}
        id={id}
        type="text"
        inputMode="numeric"
        placeholder={placeholder}
        value={display}
        className="money-input-field"
        disabled={disabled}
        autoFocus={autoFocus}
        onChange={handleChange}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onPaste={handlePaste}
      />
    </div>
  )
}
