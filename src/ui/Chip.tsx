import type { ReactNode } from 'react'

type ChipVariant = 'income' | 'expense' | 'warn' | 'invest' | 'accent' | 'muted'

interface ChipProps {
  variant: ChipVariant
  children: ReactNode
  className?: string
}

export function Chip({ variant, children, className = '' }: ChipProps) {
  return <span className={`chip chip-${variant} ${className}`}>{children}</span>
}
