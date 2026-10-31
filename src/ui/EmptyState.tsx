import type { ReactNode } from 'react'

interface EmptyStateProps {
  icon?: ReactNode
  title: string
  description?: string
  action?: ReactNode
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: '48px 16px', textAlign: 'center' }}>
      {icon && (
        <div style={{ color: 'var(--text-3)', fontSize: 40, lineHeight: 1 }} aria-hidden="true">
          {icon}
        </div>
      )}
      <p style={{ fontWeight: 600, color: 'var(--text-2)', fontSize: 15 }}>{title}</p>
      {description && <p className="muted" style={{ maxWidth: 280 }}>{description}</p>}
      {action && <div style={{ marginTop: 8 }}>{action}</div>}
    </div>
  )
}
