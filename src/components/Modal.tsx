import { useEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'

export function Modal({
  title,
  meta,
  onClose,
  children,
  footer,
  size = 'md',
}: {
  title: ReactNode
  meta?: ReactNode
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full'
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return createPortal(
    <div
      className="overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div className={`float-win ${size}`} role="dialog" aria-modal="true" aria-label={typeof title === 'string' ? title : 'Dialog'}>
        <div className="float-bar">
          <span className="win-dot" />
          <span className="float-title">{title}</span>
          {meta ? <span className="float-meta">{meta}</span> : null}
          <span className="win-bar-spacer" />
          <button className="win-btn close" onClick={onClose} aria-label="Close">
            <X size={13} />
          </button>
        </div>
        <div className="float-body">{children}</div>
        {footer ? <div className="float-foot">{footer}</div> : null}
      </div>
    </div>,
    document.body,
  )
}
