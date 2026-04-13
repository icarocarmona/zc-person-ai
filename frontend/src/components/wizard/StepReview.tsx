import { useState } from 'react'
import { ArrowLeft, Save } from 'lucide-react'
import { useWizard } from '../../context/WizardContext'
import { saveConfig } from '../../api/client'
import { formatTTL } from '../../utils/format'

function maskSecret(val?: string): string {
  if (!val) return '—'
  if (val.startsWith('•') || val.startsWith('*')) return val
  if (val.length <= 8) return '••••'
  return val.slice(0, 4) + '••••' + val.slice(-4)
}

export function StepReview() {
  const { state, dispatch } = useWizard()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const data = state.data

  const rows: { label: string; value: string }[] = [
    {
      label: 'Provedor IA',
      value: data.ai_base_url?.includes('openrouter') ? 'OpenRouter' : 'OpenAI',
    },
    { label: 'Modelo', value: data.ai_model || '—' },
    { label: 'AI API Key', value: maskSecret(data.ai_api_key) },
    {
      label: 'Canal de notificação',
      value: data.notification_channel === 'telegram' ? 'Telegram' : 'WhatsApp',
    },
    ...(data.notification_channel === 'telegram'
      ? [
          { label: 'Bot Token', value: maskSecret(data.telegram_bot_token) },
          { label: 'Chat ID', value: data.telegram_chat_id || '—' },
        ]
      : [
          { label: 'Evolution API Key', value: maskSecret(data.evolution_api_key) },
          { label: 'Instância', value: data.evolution_instance_name || '—' },
          { label: 'Número destino', value: data.whatsapp_destination_number || '—' },
        ]),
    {
      label: 'Severidades',
      value: ((data.allowed_severities as string[]) ?? []).join(', ') || '—',
    },
    {
      label: 'Janela dedup',
      value: data.dedup_ttl_seconds ? formatTTL(data.dedup_ttl_seconds as number) : '—',
    },
  ]

  const onSave = async () => {
    setSaving(true)
    setError(null)
    try {
      await saveConfig(data)
      dispatch({ type: 'NEXT' })
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <div className="card">
        <div className="card-header">
          <div className="card-title">Revisão</div>
          <div className="card-desc">Confirme as configurações antes de salvar.</div>
        </div>
        <div className="card-body" style={{ padding: 0 }}>
          <table className="review-table">
            <tbody>
              {rows.map(row => (
                <tr key={row.label}>
                  <td className="review-label">{row.label}</td>
                  <td className="review-value">{row.value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {error && (
        <div
          style={{
            marginTop: 12,
            padding: '10px 14px',
            borderRadius: 6,
            background: 'var(--error-light)',
            color: '#991b1b',
            fontSize: 13,
          }}
        >
          {error}
        </div>
      )}

      <div
        className="actions-bar mt-16"
        style={{ borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)' }}
      >
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => dispatch({ type: 'PREV' })}
        >
          <ArrowLeft size={14} /> Voltar
        </button>
        <button className="btn btn-primary" onClick={onSave} disabled={saving}>
          {saving ? (
            <>
              <div className="spinner" /> Salvando...
            </>
          ) : (
            <>
              <Save size={14} /> Salvar e concluir
            </>
          )}
        </button>
      </div>
    </div>
  )
}
