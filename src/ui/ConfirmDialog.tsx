import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'

interface ConfirmDialogProps {
  open: boolean
  title: string
  message?: string
  confirmLabel?: string
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Hapus',
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const el = dialogRef.current
    if (!el) return
    if (open) { if (!el.open) el.showModal() }
    else if (el.open) el.close()
  }, [open])

  useEffect(() => {
    const el = dialogRef.current
    if (!el) return
    const onCancel_ = (e: Event) => { e.preventDefault(); onCancel() }
    el.addEventListener('cancel', onCancel_)
    return () => el.removeEventListener('cancel', onCancel_)
  }, [onCancel])

  return createPortal(
    <dialog
      ref={dialogRef}
      className="confirm-dialog"
      onClick={(e) => { if (e.target === dialogRef.current) onCancel() }}
    >
      <div className="confirm-inner">
        <h3 className="confirm-title">{title}</h3>
        {message && <p className="confirm-msg">{message}</p>}
        <div className="confirm-actions">
          <button className="btn-ghost confirm-btn-cancel" onClick={onCancel}>Batal</button>
          <button
            className="btn confirm-btn-confirm"
            onClick={onConfirm}
            style={{ background: 'var(--expense)', color: 'var(--expense-fg)', borderColor: 'var(--expense)' }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </dialog>,
    document.body,
  )
}
