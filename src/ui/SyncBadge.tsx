import { useStore } from '../lib/store'

interface SyncBadgeProps {
  onGoSettings: () => void
}

export function SyncBadge({ onGoSettings }: SyncBadgeProps) {
  const { online, syncing, pending, failed } = useStore()

  if (failed > 0)
    return (
      <button
        onClick={onGoSettings}
        className="chip chip-warn"
        style={{ cursor: 'pointer', border: 'none', fontFamily: 'inherit', minHeight: 44 }}
        aria-label={`${failed} gagal sinkron, ketuk untuk lihat detail`}
      >
        {failed} gagal sinkron
      </button>
    )

  if (!online)
    return (
      <span
        className="chip chip-muted"
        aria-label={`Offline${pending > 0 ? `, ${pending} menunggu sinkron` : ''}`}
      >
        Offline{pending > 0 ? ` · ${pending}` : ''}
      </span>
    )

  if (syncing || pending > 0)
    return <span className="chip chip-muted">Menyinkronkan...</span>

  return (
    <span className="chip chip-muted" style={{ color: 'var(--income)' }}>
      Tersinkron
    </span>
  )
}
