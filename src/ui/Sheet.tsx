import { useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

interface SheetProps {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  footer?: ReactNode
}

export function Sheet({ open, onClose, title, children, footer }: SheetProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const triggerRef = useRef<Element | null>(null)

  useEffect(() => {
    const el = dialogRef.current
    if (!el) return
    if (open) {
      triggerRef.current = document.activeElement
      if (!el.open) el.showModal()
    } else if (el.open) {
      el.close()
      if (triggerRef.current instanceof HTMLElement) {
        triggerRef.current.focus()
      }
    }
  }, [open])

  useEffect(() => {
    const el = dialogRef.current
    if (!el) return
    const onCancel = (e: Event) => {
      e.preventDefault()
      onClose()
    }
    el.addEventListener('cancel', onCancel)
    return () => el.removeEventListener('cancel', onCancel)
  }, [onClose])

  return createPortal(
    <dialog
      ref={dialogRef}
      className="sheet-dialog"
      onClick={(e) => {
        if (e.target === dialogRef.current) onClose()
      }}
      aria-labelledby="sheet-title"
    >
      <div className="sheet-inner">
        <div className="sheet-header">
          <h2
            id="sheet-title"
            style={{ fontWeight: 600, fontSize: 18, color: 'var(--text-1)', margin: 0 }}
          >
            {title}
          </h2>
          <button
            className="btn-ghost"
            onClick={onClose}
            aria-label="Tutup"
            style={{ padding: 8, minHeight: 36, minWidth: 36, border: 'none' }}
          >
            ✕
          </button>
        </div>
        <div className="sheet-content">{children}</div>
        {footer && <div className="sheet-footer">{footer}</div>}
      </div>
    </dialog>,
    document.body,
  )
}
