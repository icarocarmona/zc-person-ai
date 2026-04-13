import { useState } from 'react'
import { X, Save } from 'lucide-react'
import { useForm, Controller } from 'react-hook-form'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { saveConfig, type Config } from '../../api/client'
import { SeverityPicker } from '../SeverityPicker'
import { SecretInput } from '../SecretInput'
import { formatTTL } from '../../utils/format'

interface NodeInspectorProps {
  configKey: string
  config: Config
  onClose: () => void
}

const NODE_TITLES: Record<string, string> = {
  severity: 'Filtro de Severidade',
  dedup: 'Deduplicação',
  ai: 'Análise IA',
  notif: 'Canal de Notificação',
}

/* ── Severity Inspector ─────────────────────────────────────── */
function SeverityInspector({ config }: { config: Config }) {
  const queryClient = useQueryClient()
  const { control, handleSubmit } = useForm({
    defaultValues: { allowed_severities: config.allowed_severities ?? ['High', 'Disaster'] },
  })
  const mutation = useMutation({
    mutationFn: saveConfig,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['config'] }),
  })
  return (
    <form onSubmit={handleSubmit(v => mutation.mutate(v))}>
      <div className="form-field">
        <label>Severidades ativas</label>
        <div className="mt-4">
          <Controller
            name="allowed_severities"
            control={control}
            render={({ field }) => (
              <SeverityPicker value={field.value} onChange={field.onChange} />
            )}
          />
        </div>
      </div>
      <SaveBtn pending={mutation.isPending} />
    </form>
  )
}

/* ── Dedup Inspector ────────────────────────────────────────── */
function DedupInspector({ config }: { config: Config }) {
  const queryClient = useQueryClient()
  const { register, handleSubmit, watch } = useForm({
    defaultValues: { dedup_ttl_seconds: config.dedup_ttl_seconds ?? 1800 },
  })
  const mutation = useMutation({
    mutationFn: saveConfig,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['config'] }),
  })
  const ttl = watch('dedup_ttl_seconds')
  return (
    <form onSubmit={handleSubmit(v => mutation.mutate(v))}>
      <div className="form-field">
        <label>
          Janela de deduplicação{' '}
          <span className="label-hint">{formatTTL(ttl ?? 1800)}</span>
        </label>
        <div className="slider-wrapper mt-4">
          <div className="slider-row">
            <input
              type="range"
              min={60}
              max={86400}
              step={60}
              {...register('dedup_ttl_seconds', { valueAsNumber: true })}
            />
            <span className="slider-value">{formatTTL(ttl ?? 1800)}</span>
          </div>
          <div className="text-muted text-sm">Mín: 1 min — Máx: 24 h</div>
        </div>
      </div>
      <SaveBtn pending={mutation.isPending} />
    </form>
  )
}

/* ── AI Inspector ───────────────────────────────────────────── */
function AIInspector({ config }: { config: Config }) {
  const queryClient = useQueryClient()
  const { register, control, handleSubmit, formState: { errors } } = useForm({
    defaultValues: {
      ai_api_key: config.ai_api_key ?? '',
      ai_model: config.ai_model ?? 'gpt-4o',
    },
  })
  const mutation = useMutation({
    mutationFn: saveConfig,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['config'] }),
  })
  return (
    <form onSubmit={handleSubmit(v => mutation.mutate(v))}>
      <div className="form-field" style={{ marginBottom: 12 }}>
        <label>API Key</label>
        <Controller
          name="ai_api_key"
          control={control}
          render={({ field }) => (
            <SecretInput {...field} placeholder="sk-..." hasError={!!errors.ai_api_key} />
          )}
        />
      </div>
      <div className="form-field">
        <label>Modelo</label>
        <input
          {...register('ai_model', { required: 'Obrigatório' })}
          placeholder="gpt-4o"
          list="model-suggestions-inspector"
        />
        <datalist id="model-suggestions-inspector">
          {['gpt-4o', 'gpt-4o-mini', 'openai/gpt-4o', 'anthropic/claude-sonnet-4-5'].map(m => (
            <option key={m} value={m} />
          ))}
        </datalist>
        {errors.ai_model && <span className="field-error">{errors.ai_model.message}</span>}
      </div>
      <SaveBtn pending={mutation.isPending} />
    </form>
  )
}

/* ── Notif Inspector ────────────────────────────────────────── */
function NotifInspector({ config }: { config: Config }) {
  const queryClient = useQueryClient()
  const [channel, setChannel] = useState<'whatsapp' | 'telegram'>(
    (config.notification_channel as 'whatsapp' | 'telegram') ?? 'whatsapp'
  )
  const { register, handleSubmit } = useForm({
    defaultValues: {
      whatsapp_destination_number: config.whatsapp_destination_number ?? '',
      telegram_chat_id: config.telegram_chat_id ?? '',
    },
  })
  const mutation = useMutation({
    mutationFn: saveConfig,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['config'] })
      queryClient.invalidateQueries({ queryKey: ['status'] })
    },
  })

  return (
    <form
      onSubmit={handleSubmit(v => mutation.mutate({ ...v, notification_channel: channel }))}
    >
      <div className="form-field" style={{ marginBottom: 12 }}>
        <label>Canal</label>
        <div className="provider-cards" style={{ gridTemplateColumns: '1fr 1fr', marginTop: 6 }}>
          {(['whatsapp', 'telegram'] as const).map(c => (
            <label key={c} className={`provider-card ${channel === c ? 'selected' : ''}`}>
              <input type="radio" checked={channel === c} onChange={() => setChannel(c)} />
              <div className="provider-card-content">
                <span className="provider-card-name">
                  {c === 'whatsapp' ? 'WhatsApp' : 'Telegram'}
                </span>
              </div>
            </label>
          ))}
        </div>
      </div>

      {channel === 'whatsapp' && (
        <div className="form-field" style={{ marginBottom: 12 }}>
          <label>Número destino</label>
          <input {...register('whatsapp_destination_number')} placeholder="5511999999999" />
        </div>
      )}

      {channel === 'telegram' && (
        <div className="form-field" style={{ marginBottom: 12 }}>
          <label>Chat ID</label>
          <input {...register('telegram_chat_id')} placeholder="-100123456789" />
        </div>
      )}

      <SaveBtn pending={mutation.isPending} />
    </form>
  )
}

/* ── Shared Save button ─────────────────────────────────────── */
function SaveBtn({ pending }: { pending: boolean }) {
  return (
    <button
      type="submit"
      className="btn btn-primary"
      style={{ marginTop: 16, width: '100%' }}
      disabled={pending}
    >
      {pending ? (
        <><div className="spinner" /> Salvando...</>
      ) : (
        <><Save size={14} /> Salvar</>
      )}
    </button>
  )
}

/* ── Main NodeInspector ─────────────────────────────────────── */
export function NodeInspector({ configKey, config, onClose }: NodeInspectorProps) {
  return (
    <div className="node-inspector">
      <div className="node-inspector-header">
        <span className="node-inspector-title">{NODE_TITLES[configKey]}</span>
        <button className="btn-icon" onClick={onClose} aria-label="Fechar">
          <X size={16} />
        </button>
      </div>
      <div className="node-inspector-body">
        {configKey === 'severity' && <SeverityInspector config={config} />}
        {configKey === 'dedup' && <DedupInspector config={config} />}
        {configKey === 'ai' && <AIInspector config={config} />}
        {configKey === 'notif' && <NotifInspector config={config} />}
      </div>
    </div>
  )
}
