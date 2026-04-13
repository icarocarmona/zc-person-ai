interface ServiceCardProps {
  name: string
  ok: boolean | null
  value?: string
  meta?: string
}

export function ServiceCard({ name, ok, value, meta }: ServiceCardProps) {
  const dotClass = ok === null ? 'loading' : ok ? 'ok' : 'error'
  const displayValue = ok === null ? '...' : ok ? (value ?? 'Online') : 'Offline'

  return (
    <div className="status-card">
      <div className="status-card-top">
        <span className="status-card-name">{name}</span>
        <span className={`status-dot ${dotClass}`} />
      </div>
      <div className="status-card-value">{displayValue}</div>
      {meta && <div className="status-card-meta">{meta}</div>}
    </div>
  )
}
