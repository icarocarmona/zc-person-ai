import { Bot, MessageSquare, Bell, ArrowRight } from 'lucide-react'
import { useWizard } from '../../context/WizardContext'

export function StepWelcome() {
  const { dispatch } = useWizard()
  return (
    <div className="card">
      <div className="card-body" style={{ padding: '32px 40px' }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{
            width: 64, height: 64, borderRadius: 16, background: 'var(--primary-light)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 16px', color: 'var(--primary)',
          }}>
            <Bot size={32} />
          </div>
          <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>
            Bem-vindo ao Zabbix Alert Agent
          </h2>
          <p style={{ color: 'var(--text-muted)', maxWidth: 480, margin: '0 auto' }}>
            Este assistente vai configurar o agente de alertas. São apenas 4 passos rápidos.
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 32 }}>
          {[
            { icon: <Bot size={18} />, title: 'Provedor de IA', desc: 'OpenAI ou OpenRouter' },
            { icon: <MessageSquare size={18} />, title: 'Notificação', desc: 'WhatsApp ou Telegram' },
            { icon: <Bell size={18} />, title: 'Filtros', desc: 'Severidades e dedup' },
          ].map((item) => (
            <div key={item.title} style={{
              padding: '14px 16px', border: '1px solid var(--border)',
              borderRadius: 'var(--radius)', background: 'var(--surface-alt)',
            }}>
              <div style={{ color: 'var(--primary)', marginBottom: 6 }}>{item.icon}</div>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{item.title}</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{item.desc}</div>
            </div>
          ))}
        </div>

        <div style={{ textAlign: 'center' }}>
          <button
            className="btn btn-primary"
            style={{ height: 40, padding: '0 28px', fontSize: 14 }}
            onClick={() => dispatch({ type: 'NEXT' })}
          >
            Começar <ArrowRight size={15} />
          </button>
        </div>
      </div>
    </div>
  )
}
