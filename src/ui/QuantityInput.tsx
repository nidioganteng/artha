import { useCallback, useEffect, useRef, useState, type ChangeEvent, type ClipboardEvent, type FocusEvent } from 'react'
import { formatQuantityInput, parseQuantityInput } from '../lib/numInput'

export interface QuantityInputProps {
  id?: string
  value: number | null
  onValueChange: (value: number | null) => void
  placeholder?: string
  maxDecimals?: number
  disabled?: boolean
  autoFocus?: boolean
}

function toDisplay(v: number | null, maxDecimals: number): string {
  return v == null ? '' : formatQuantityInput(String(v), maxDecimals)
}

export function QuantityInput({ id, value, onValueChange, placeholder = '0,00012345', maxDecimals = 8, disabled, autoFocus }: QuantityInputProps) {
  const focusedRef = useRef(false)
  const displayRef = useRef('')
  const [display, setDisplay] = useState(() => toDisplay(value, maxDecimals))
  displayRef.current = display

  useEffect(() => {
    if (!focusedRef.current) {
      setDisplay(toDisplay(value, maxDecimals))
    }
  }, [value, maxDecimals])

  const handleChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    const prevWasZero = displayRef.current === '0'

    // 1. Normalisasi titik ke koma, strip karakter tidak valid
    let raw = e.target.value
      .replace(/\./g, ',')
      .replace(/[^\d,]/g, '')

    // 2. Hanya satu koma
    const firstComma = raw.indexOf(',')
    if (firstComma !== -1) {
      raw = raw.slice(0, firstComma + 1) + raw.slice(firstComma + 1).replace(/,/g, '')
    }

    // 3. Otomatis tambah koma desimal: "0" + angka -> "0,angka"
    if (prevWasZero && !raw.includes(',') && /^0\d/.test(raw)) {
      raw = '0,' + raw.slice(1)
    }

    const formatted = formatQuantityInput(raw, maxDecimals)
    setDisplay(formatted)
    onValueChange(parseQuantityInput(formatted))
  }, [maxDecimals, onValueChange])

  const handleFocus = useCallback(() => {
    focusedRef.current = true
  }, [])

  const handleBlur = useCallback((e: FocusEvent<HTMLInputElement>) => {
    focusedRef.current = false
    const formatted = formatQuantityInput(e.target.value, maxDecimals)
    setDisplay(formatted)
    onValueChange(parseQuantityInput(formatted))
  }, [maxDecimals, onValueChange])

  const handlePaste = useCallback((e: ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault()
    const text = e.clipboardData.getData('text')
    const formatted = formatQuantityInput(text, maxDecimals)
    setDisplay(formatted)
    onValueChange(parseQuantityInput(formatted))
  }, [maxDecimals, onValueChange])

  return (
    <input
      id={id}
      type="text"
      inputMode="decimal"
      placeholder={placeholder}
      value={display}
      className="input"
      disabled={disabled}
      autoFocus={autoFocus}
      onChange={handleChange}
      onFocus={handleFocus}
      onBlur={handleBlur}
      onPaste={handlePaste}
    />
  )
}
