import { useAppStore } from '../store'
import { X } from 'lucide-react'

export function Toasts() {
  const toasts = useAppStore((state) => state.toasts)
  const dismiss = useAppStore((state) => state.dismissToast)
  if (toasts.length === 0) return null
  return (
    <div className="toasts">
      {toasts.map((toast) => (
        <div key={toast.id} className={`toast ${toast.kind}`}>
          <span className="tag">
            {toast.kind === 'success' ? '[OK]' : toast.kind === 'error' ? '[ERR]' : '[..]'}
          </span>
          <span className="msg-text">{toast.message}</span>
          <button onClick={() => dismiss(toast.id)} aria-label="Dismiss">
            <X size={11} />
          </button>
        </div>
      ))}
    </div>
  )
}
