import type { ReactNode } from 'react'

export function Logo({ size = 22 }: { size?: number }) {
  return (
    <span
      className="logo-mark"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.82) }}
      aria-hidden="true"
    >
      ∫
    </span>
  )
}

export function Window({
  title,
  meta,
  actions,
  children,
  className = '',
}: {
  title: ReactNode
  meta?: ReactNode
  actions?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section className={`win ${className}`}>
      <header className="win-bar">
        <span className="win-dot" />
        <span className="win-title">{title}</span>
        {meta ? <span className="win-meta">{meta}</span> : null}
        <span className="win-bar-spacer" />
        {actions ? <div className="win-actions">{actions}</div> : null}
      </header>
      <div className="win-body">{children}</div>
    </section>
  )
}
