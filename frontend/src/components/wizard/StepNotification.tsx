import { useState } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { ArrowRight, ArrowLeft, MessageSquare, Send } from 'lucide-react'
import { useWizard } from '../../context/WizardContext'
import { SecretInput } from '../SecretInput'

type Channel = 'whatsapp' | 'telegram'

export function StepNotification() {
  const { state, dispatch } = useWizard()
  const [channel, setChannel] = useState<Channel>(
    (state.data.notification_channel as Channel) ?? 'whatsapp'
  )

  const { register, handleSubmit, control, formState: { errors } } = useForm({
    defaultValues: {
      evolution_api_key: state.data.evolution_api_key ?? '',
      evolution_instance_name: state.data.evolution_instance_name ?? 'zabbix-alerts',
      evolution_base_url: state.data.evolution_base_url ?? 'http://evolution-api:8080',
      whatsapp_destination_number: state.data.whatsapp_destination_number ?? '',
      telegram_bot_token: state.data.telegram_bot_token ?? '',
      telegram_chat_id: state.data.telegram_chat_id ?? '',
    },
  })

  const onSubmit = (values: Record<string, string>) => {
    dispatch({ type: 'UPDATE', data: { ...values, notification_channel: channel } })
    dispatch({ type: 'NEXT' })
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <div className="card">
        <div className="card-header">
          <div className="card-title">Canal de Notificação</div>
          <div className="card-desc">Onde os alertas serão enviados.</div>
        </div>
        <div className="card-body">
          <div className="form-field" style={{ marginBottom: 24 }}>
            <label>Canal</label>
            <div className="provider-cards">
              <label className={`provider-card ${channel === 'whatsapp' ? 'selected' : ''}`}>
                <input type="radio" name="channel" checked={channel === 'whatsapp'} onChange={() => setChannel('whatsapp')} />
                <div className="provider-card-content">
                  <span className="provider-card-name" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <MessageSquare size={14} /> WhatsApp
                  </span>
                  <span className="provider-card-sub">Via Evolution API self-hosted</span>
                </div>
              </label>
              <label className={`provider-card ${channel === 'telegram' ? 'selected' : ''}`}>
                <input type="radio" name="channel" checked={channel === 'telegram'} onChange={() => setChannel('telegram')} />
                <div className="provider-card-content">
                  <span className="provider-card-name" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Send size={14} /> Telegram
                  </span>
                  <span className="provider-card-sub">Via Telegram Bot API</span>
                </div>
              </label>
            </div>
          </div>

          {channel === 'whatsapp' && (
            <div className="form-grid">
              <div className="form-field">
                <label>Evolution API Key <span className="label-hint">*</span></label>
                <Controller name="evolution_api_key" control={control} rules={{ required: 'Obrigatório' }}
                  render={({ field }) => (
                    <SecretInput {...field} placeholder="change-me-strong-secret" hasError={!!errors.evolution_api_key} />
                  )}
                />
                {errors.evolution_api_key && <span className="field-error">{errors.evolution_api_key.message}</span>}
              </div>
              <div className="form-field">
                <label>Nome da instância</label>
                <input {...register('evolution_instance_name')} placeholder="zabbix-alerts" />
              </div>
              <div className="form-field full">
                <label>Número de destino <span className="label-hint">* DDI + DDD + número</span></label>
                <input {...register('whatsapp_destination_number', {
                  required: 'Obrigatório',
                  pattern: { value: /^\d{10,}$/, message: 'Somente dígitos, mínimo 10' },
                })} placeholder="5511999999999" className={errors.whatsapp_destination_number ? 'error' : ''} />
                {errors.whatsapp_destination_number && <span className="field-error">{errors.whatsapp_destination_number.message}</span>}
              </div>
            </div>
          )}

          {channel === 'telegram' && (
            <div className="form-grid">
              <div className="form-field full">
                <label>Bot Token <span className="label-hint">* obtido no BotFather</span></label>
                <Controller name="telegram_bot_token" control={control} rules={{ required: 'Obrigatório' }}
                  render={({ field }) => (
                    <SecretInput {...field} placeholder="123456789:ABCDef..." hasError={!!errors.telegram_bot_token} />
                  )}
                />
                {errors.telegram_bot_token && <span className="field-error">{errors.telegram_bot_token.message}</span>}
              </div>
              <div className="form-field full">
                <label>Chat ID <span className="label-hint">* ID do usuário ou grupo destino</span></label>
                <input {...register('telegram_chat_id', { required: 'Obrigatório' })}
                  placeholder="-100123456789" className={errors.telegram_chat_id ? 'error' : ''} />
                {errors.telegram_chat_id && <span className="field-error">{errors.telegram_chat_id.message}</span>}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="actions-bar mt-16" style={{ borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)' }}>
        <button type="button" className="btn btn-secondary" onClick={() => dispatch({ type: 'PREV' })}>
          <ArrowLeft size={14} /> Voltar
        </button>
        <button type="submit" className="btn btn-primary">
          Próximo <ArrowRight size={14} />
        </button>
      </div>
    </form>
  )
}
