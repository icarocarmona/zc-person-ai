import { Bot, MessageSquare, Bell, ArrowRight } from 'lucide-react'
import { useWizard } from '../../context/WizardContext'

const FEATURES = [
  { icon: <Bot size={20} />,         title: 'Provedor de IA',   desc: 'OpenAI ou OpenRouter' },
  { icon: <MessageSquare size={20} />, title: 'Notificação',    desc: 'WhatsApp ou Telegram' },
  { icon: <Bell size={20} />,         title: 'Filtros',          desc: 'Severidades e dedup' },
]

export function StepWelcome() {
  const { dispatch } = useWizard()

  return (
    <div className="card">
      <div className="card-body welcome-body">
        {/* Hero */}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{
            width: 60, height: 60, borderRadius: 14,
            background: 'var(--primary-light)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 16px', color: 'var(--primary)',
          }}>
            <Bot size={28} />
          </div>
          <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8, letterSpacing: '-.03em' }}>
            Bem-vindo ao Zabbix Alert Agent
          </h2>
          <p style={{
            color: 'var(--text-muted)', maxWidth: 440, margin: '0 auto',
            fontSize: 14, lineHeight: 1.6,
          }}>
            Configure o agente de alertas em 4 passos rápidos. Você pode alterar tudo depois.
          </p>
        </div>

        {/* Feature cards */}
        <div className="welcome-features">
          {FEATURES.map(item => (
            <div key={item.title} className="welcome-feature-card">
              <div style={{ color: 'var(--primary)', marginBottom: 8 }}>{item.icon}</div>
              <div style={{ fontSize: 13, fontWeight: 600, letterSpacing: '-.01em', marginBottom: 3 }}>
                {item.title}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{item.desc}</div>
            </div>
          ))}
        </div>

        {/* CTA */}
        <div style={{ textAlign: 'center' }}>
          <button
            className="btn btn-primary"
            style={{ height: 42, padding: '0 32px', fontSize: 14 }}
            onClick={() => dispatch({ type: 'NEXT' })}
          >
            Começar <ArrowRight size={15} />
          </button>
        </div>
      </div>
    </div>
  )
}
