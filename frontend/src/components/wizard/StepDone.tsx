import { CheckCircle, ArrowRight, Settings2 } from 'lucide-react'
import { useWizard } from '../../context/WizardContext'

interface StepDoneProps {
  onComplete: () => void
  onReconfigure: () => void
}

export function StepDone({ onComplete, onReconfigure }: StepDoneProps) {
  const { dispatch } = useWizard()

  const handleReconfigure = () => {
    dispatch({ type: 'GO_TO', step: 'ai' })
    onReconfigure()
  }

  return (
    <div className="card">
      <div className="card-body" style={{ padding: '48px 40px', textAlign: 'center' }}>
        <div
          style={{
            width: 64,
            height: 64,
            borderRadius: '50%',
            background: 'var(--success-light)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 20px',
            color: 'var(--success)',
          }}
        >
          <CheckCircle size={32} />
        </div>

        <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>
          Configuração concluída!
        </h2>
        <p style={{ color: 'var(--text-muted)', maxWidth: 420, margin: '0 auto 32px' }}>
          Os serviços foram recarregados com as novas configurações. Verifique o status dos serviços
          na página de Status.
        </p>

        <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
          <button
            className="btn btn-secondary"
            onClick={handleReconfigure}
          >
            <Settings2 size={14} /> Reconfigurar
          </button>
          <button
            className="btn btn-primary"
            style={{ height: 40, padding: '0 28px' }}
            onClick={onComplete}
          >
            Ver Status <ArrowRight size={14} />
          </button>
        </div>
      </div>
    </div>
  )
}
