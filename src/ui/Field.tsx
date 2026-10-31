import type { ReactNode } from 'react'

interface FieldProps {
  label: string
  htmlFor: string
  children: ReactNode
  error?: string
  className?: string
}

export function Field({ label, htmlFor, children, error, className = '' }: FieldProps) {
  return (
    <div className={className}>
      <label className="label" htmlFor={htmlFor}>{label}</label>
      {children}
      {error && (
        <p className="mt-1 text-xs" style={{ color: 'var(--expense)' }}>{error}</p>
      )}
    </div>
  )
}
