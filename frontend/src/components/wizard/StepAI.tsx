import { useState } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { ArrowRight, ArrowLeft } from 'lucide-react'
import { useWizard } from '../../context/WizardContext'
import { SecretInput } from '../SecretInput'

const PROVIDERS = {
  openai: { label: 'OpenAI', sub: 'GPT-4o · direto na OpenAI', url: 'https://api.openai.com/v1', models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo'] },
  openrouter: { label: 'OpenRouter', sub: 'Acesso a Claude, Gemini e outros', url: 'https://openrouter.ai/api/v1', models: ['openai/gpt-4o', 'anthropic/claude-sonnet-4-5', 'anthropic/claude-opus-4', 'google/gemini-pro-1.5'] },
} as const

type ProviderKey = keyof typeof PROVIDERS

export function StepAI() {
  const { state, dispatch } = useWizard()
  const defaultProvider: ProviderKey = state.data.ai_base_url?.includes('openrouter') ? 'openrouter' : 'openai'
  const [provider, setProvider] = useState<ProviderKey>(defaultProvider)

  const { register, handleSubmit, control, setValue, formState: { errors } } = useForm({
    defaultValues: {
      ai_api_key: state.data.ai_api_key ?? '',
      ai_model: state.data.ai_model ?? PROVIDERS[defaultProvider].models[0],
      ai_base_url: state.data.ai_base_url ?? PROVIDERS[defaultProvider].url,
    },
  })

  const onProviderChange = (p: ProviderKey) => {
    setProvider(p)
    setValue('ai_base_url', PROVIDERS[p].url)
    setValue('ai_model', PROVIDERS[p].models[0])
  }

  const onSubmit = (values: Record<string, string>) => {
    dispatch({ type: 'UPDATE', data: values })
    dispatch({ type: 'NEXT' })
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <div className="card">
        <div className="card-header">
          <div className="card-title">Provedor de IA</div>
          <div className="card-desc">Modelo usado para análise dos alertas.</div>
        </div>
        <div className="card-body">
          <div className="form-field" style={{ marginBottom: 20 }}>
            <label>Provedor</label>
            <div className="provider-cards">
              {(Object.keys(PROVIDERS) as ProviderKey[]).map(p => (
                <label key={p} className={`provider-card ${provider === p ? 'selected' : ''}`}>
                  <input type="radio" name="provider" checked={provider === p} onChange={() => onProviderChange(p)} />
                  <div className="provider-card-content">
                    <span className="provider-card-name">{PROVIDERS[p].label}</span>
                    <span className="provider-card-sub">{PROVIDERS[p].sub}</span>
                  </div>
                </label>
              ))}
            </div>
          </div>

          <div className="form-grid">
            <div className="form-field">
              <label>API Key <span className="label-hint">*</span></label>
              <Controller name="ai_api_key" control={control} rules={{ required: 'Obrigatório' }}
                render={({ field }) => (
                  <SecretInput {...field} placeholder={provider === 'openai' ? 'sk-...' : 'sk-or-...'} hasError={!!errors.ai_api_key} />
                )}
              />
              {errors.ai_api_key && <span className="field-error">{errors.ai_api_key.message}</span>}
            </div>

            <div className="form-field">
              <label>Modelo</label>
              <input {...register('ai_model', { required: 'Obrigatório' })} list="model-suggestions"
                placeholder={PROVIDERS[provider].models[0]} className={errors.ai_model ? 'error' : ''} />
              <datalist id="model-suggestions">
                {PROVIDERS[provider].models.map(m => <option key={m} value={m} />)}
              </datalist>
              {errors.ai_model && <span className="field-error">{errors.ai_model.message}</span>}
            </div>

            <div className="form-field full">
              <label>Base URL <span className="label-hint">preenchido automaticamente</span></label>
              <input {...register('ai_base_url')} readOnly style={{ background: 'var(--surface-alt)', color: 'var(--text-muted)' }} />
            </div>
          </div>
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
