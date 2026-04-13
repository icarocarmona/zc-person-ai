import { useEffect, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm, Controller } from 'react-hook-form'
import { Bot, MessageSquare, Bell, Settings2, Save } from 'lucide-react'
import { getConfig, saveConfig, type Config } from '../api/client'
import { SecretInput } from '../components/SecretInput'
import { SeverityPicker } from '../components/SeverityPicker'

type FormValues = Config

const PROVIDER_URLS: Record<string, string> = {
  openai: 'https://api.openai.com/v1',
  openrouter: 'https://openrouter.ai/api/v1',
}

const PROVIDER_MODELS: Record<string, string[]> = {
  openai: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo'],
  openrouter: [
    'openai/gpt-4o',
    'anthropic/claude-sonnet-4-5',
    'anthropic/claude-opus-4',
    'google/gemini-pro-1.5',
  ],
}

function formatTTL(seconds: number): string {
  if (seconds < 3600) return `${Math.round(seconds / 60)} min`
  return `${(seconds / 3600).toFixed(1).replace('.0', '')} h`
}

interface ToastItem { id: number; ok: boolean; text: string }

export function SetupPage() {
  const queryClient = useQueryClient()
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const [provider, setProvider] = useState<'openai' | 'openrouter'>('openai')

  const addToast = (ok: boolean, text: string) => {
    const id = Date.now()
    setToasts(t => [...t, { id, ok, text }])
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 4000)
  }

  const { data: config, isLoading } = useQuery({
    queryKey: ['config'],
    queryFn: getConfig,
  })

  const { register, handleSubmit, control, reset, watch, setValue, formState: { errors, isDirty } } =
    useForm<FormValues>({
      defaultValues: {
        ai_base_url: PROVIDER_URLS.openai,
        ai_model: 'gpt-4o',
        evolution_instance_name: 'zabbix-alerts',
        evolution_base_url: 'http://evolution-api:8080',
        redis_url: 'redis://redis:6379/0',
        log_level: 'INFO',
        dedup_ttl_seconds: 1800,
        allowed_severities: ['High', 'Disaster'],
      },
    })

  useEffect(() => {
    if (config) {
      reset(config)
      const isOpenRouter = config.ai_base_url?.includes('openrouter')
      setProvider(isOpenRouter ? 'openrouter' : 'openai')
    }
  }, [config, reset])

  const saveMutation = useMutation({
    mutationFn: saveConfig,
    onSuccess: () => {
      addToast(true, 'Configuração salva e serviços recarregados!')
      queryClient.invalidateQueries({ queryKey: ['config'] })
      queryClient.invalidateQueries({ queryKey: ['status'] })
    },
    onError: (e: Error) => addToast(false, e.message),
  })

  const onProviderChange = (p: 'openai' | 'openrouter') => {
    setProvider(p)
    setValue('ai_base_url', PROVIDER_URLS[p], { shouldDirty: true })
    setValue('ai_model', PROVIDER_MODELS[p][0] ?? '', { shouldDirty: true })
  }

  const ttlValue = watch('dedup_ttl_seconds')

  if (isLoading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200 }}>
        <div className="spinner spinner-dark" style={{ width: 24, height: 24 }} />
      </div>
    )
  }

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Configuração</h1>
        <p className="page-subtitle">
          As configurações são salvas no banco e aplicadas imediatamente.
        </p>
      </div>

      <form onSubmit={handleSubmit(data => saveMutation.mutate(data))}>

        {/* ── AI Provider ── */}
        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title"><Bot size={15} /> Provedor de IA</div>
              <div className="card-desc">Modelo usado para análise dos alertas.</div>
            </div>
          </div>
          <div className="card-body">
            <div className="form-field" style={{ marginBottom: 20 }}>
              <label>Provedor</label>
              <div className="provider-cards">
                {(['openai', 'openrouter'] as const).map(p => (
                  <label key={p} className={`provider-card ${provider === p ? 'selected' : ''}`}>
                    <input
                      type="radio"
                      name="provider"
                      checked={provider === p}
                      onChange={() => onProviderChange(p)}
                    />
                    <div className="provider-card-content">
                      <span className="provider-card-name">
                        {p === 'openai' ? 'OpenAI' : 'OpenRouter'}
                      </span>
                      <span className="provider-card-sub">
                        {p === 'openai'
                          ? 'GPT-4o · direto na OpenAI'
                          : 'Acesso a Claude, Gemini e outros'}
                      </span>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            <div className="form-grid">
              <div className="form-field">
                <label>API Key <span className="label-hint">*</span></label>
                <Controller
                  name="ai_api_key"
                  control={control}
                  rules={{ required: 'Obrigatório' }}
                  render={({ field }) => (
                    <SecretInput
                      {...field}
                      placeholder={provider === 'openai' ? 'sk-...' : 'sk-or-...'}
                      hasError={!!errors.ai_api_key}
                    />
                  )}
                />
                {errors.ai_api_key && <span className="field-error">{errors.ai_api_key.message}</span>}
              </div>

              <div className="form-field">
                <label>Modelo</label>
                <input
                  {...register('ai_model', { required: 'Obrigatório' })}
                  list="model-suggestions"
                  placeholder={PROVIDER_MODELS[provider][0]}
                  className={errors.ai_model ? 'error' : ''}
                />
                <datalist id="model-suggestions">
                  {PROVIDER_MODELS[provider].map(m => <option key={m} value={m} />)}
                </datalist>
                {errors.ai_model && <span className="field-error">{errors.ai_model.message}</span>}
              </div>

              <div className="form-field full">
                <label>Base URL</label>
                <input
                  {...register('ai_base_url')}
                  type="url"
                  readOnly
                  style={{ background: 'var(--surface-alt)', color: 'var(--text-muted)' }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* ── WhatsApp ── */}
        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title"><MessageSquare size={15} /> WhatsApp</div>
              <div className="card-desc">Credenciais da Evolution API e número de destino.</div>
            </div>
          </div>
          <div className="card-body">
            <div className="form-grid">
              <div className="form-field">
                <label>Evolution API Key <span className="label-hint">*</span></label>
                <Controller
                  name="evolution_api_key"
                  control={control}
                  rules={{ required: 'Obrigatório' }}
                  render={({ field }) => (
                    <SecretInput
                      {...field}
                      placeholder="change-me-strong-secret"
                      hasError={!!errors.evolution_api_key}
                    />
                  )}
                />
                {errors.evolution_api_key && (
                  <span className="field-error">{errors.evolution_api_key.message}</span>
                )}
              </div>

              <div className="form-field">
                <label>Nome da instância</label>
                <input {...register('evolution_instance_name')} placeholder="zabbix-alerts" />
              </div>

              <div className="form-field full">
                <label>
                  Número de destino <span className="label-hint">* com DDI, ex: 5511999999999</span>
                </label>
                <input
                  {...register('whatsapp_destination_number', {
                    required: 'Obrigatório',
                    pattern: { value: /^\d{10,}$/, message: 'Somente dígitos, mínimo 10' },
                  })}
                  placeholder="5511999999999"
                  className={errors.whatsapp_destination_number ? 'error' : ''}
                />
                {errors.whatsapp_destination_number && (
                  <span className="field-error">{errors.whatsapp_destination_number.message}</span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ── Filtros ── */}
        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title"><Bell size={15} /> Filtros de Alerta</div>
              <div className="card-desc">Quais alertas serão processados e janela de deduplicação.</div>
            </div>
          </div>
          <div className="card-body">
            <div className="form-field" style={{ marginBottom: 20 }}>
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

            <div className="form-field">
              <label>
                Janela de deduplicação{' '}
                <span className="label-hint">impede alertas duplicados na janela</span>
              </label>
              <div className="slider-wrapper">
                <div className="slider-row">
                  <input
                    type="range"
                    min={60}
                    max={86400}
                    step={60}
                    {...register('dedup_ttl_seconds', { valueAsNumber: true })}
                  />
                  <span className="slider-value">{formatTTL(ttlValue ?? 1800)}</span>
                </div>
                <div className="text-muted text-sm">
                  Mín: 1 min — Máx: 24 h
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ── Avançado ── */}
        <div className="card">
          <div className="card-body">
            <details>
              <summary><Settings2 size={14} /> Configurações avançadas</summary>
              <div className="form-grid">
                <div className="form-field">
                  <label>Log level</label>
                  <select {...register('log_level')}>
                    <option>DEBUG</option>
                    <option>INFO</option>
                    <option>WARNING</option>
                    <option>ERROR</option>
                  </select>
                </div>

                <div className="form-field">
                  <label>Redis URL <span className="label-hint">injetado pelo docker-compose</span></label>
                  <input {...register('redis_url')} placeholder="redis://redis:6379/0" />
                </div>

                <div className="form-field full">
                  <label>
                    Evolution Base URL <span className="label-hint">injetado pelo docker-compose</span>
                  </label>
                  <input {...register('evolution_base_url')} placeholder="http://evolution-api:8080" />
                </div>
              </div>
            </details>
          </div>
        </div>

        {/* ── Actions ── */}
        <div className="actions-bar mt-16" style={{ borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)' }}>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={saveMutation.isPending || !isDirty}
          >
            {saveMutation.isPending
              ? <><div className="spinner" /> Salvando...</>
              : <><Save size={14} /> Salvar configuração</>
            }
          </button>
        </div>
      </form>

      {/* ── Toasts ── */}
      <div className="toast-container">
        {toasts.map(t => (
          <div key={t.id} className={`toast ${t.ok ? 'success' : 'error'}`}>
            {t.ok
              ? <span style={{ color: 'var(--success)' }}>✓</span>
              : <span style={{ color: 'var(--error)' }}>✕</span>
            }
            {t.text}
          </div>
        ))}
      </div>
    </div>
  )
}
