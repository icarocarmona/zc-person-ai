import { useState } from 'react'
import { Plus, X } from 'lucide-react'

interface SeverityPickerProps {
  value: string[]
  onChange: (value: string[]) => void
}

const PRESETS = ['Disaster', 'High', 'Average', 'Warning', 'Information']

export function SeverityPicker({ value, onChange }: SeverityPickerProps) {
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState('')

  const remove = (sev: string) => onChange(value.filter(s => s !== sev))

  const confirmAdd = () => {
    const trimmed = draft.trim()
    if (trimmed && !value.includes(trimmed)) {
      onChange([...value, trimmed])
    }
    setDraft('')
    setAdding(false)
  }

  return (
    <div className="severity-picker">
      {PRESETS.map(sev => {
        const active = value.includes(sev)
        return (
          <button
            key={sev}
            type="button"
            className={`chip ${active ? 'active' : ''}`}
            onClick={() => active ? remove(sev) : onChange([...value, sev])}
          >
            {sev}
            {active && (
              <span className="chip-remove" onClick={e => { e.stopPropagation(); remove(sev) }}>
                <X size={11} />
              </span>
            )}
          </button>
        )
      })}

      {value.filter(s => !PRESETS.includes(s)).map(sev => (
        <span key={sev} className="chip active">
          {sev}
          <button className="chip-remove" type="button" onClick={() => remove(sev)}>
            <X size={11} />
          </button>
        </span>
      ))}

      {adding ? (
        <input
          autoFocus
          className="chip-input"
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') { e.preventDefault(); confirmAdd() }
            if (e.key === 'Escape') { setAdding(false); setDraft('') }
          }}
          onBlur={confirmAdd}
          placeholder="Custom…"
        />
      ) : (
        <button type="button" className="chip-add" onClick={() => setAdding(true)}>
          <Plus size={12} /> Adicionar
        </button>
      )}
    </div>
  )
}
