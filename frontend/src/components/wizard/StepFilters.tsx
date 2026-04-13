import { useForm, Controller } from 'react-hook-form'
import { ArrowRight, ArrowLeft } from 'lucide-react'
import { useWizard } from '../../context/WizardContext'
import { SeverityPicker } from '../SeverityPicker'
import { formatTTL } from '../../utils/format'

export function StepFilters() {
  const { state, dispatch } = useWizard()

  const { handleSubmit, control, watch, register } = useForm({
    defaultValues: {
      allowed_severities: (state.data.allowed_severities as string[]) ?? ['High', 'Disaster'],
      dedup_ttl_seconds: state.data.dedup_ttl_seconds ?? 1800,
    },
  })

  const ttlValue = watch('dedup_ttl_seconds')

  const onSubmit = (values: { allowed_severities: string[]; dedup_ttl_seconds: number }) => {
    dispatch({ type: 'UPDATE', data: values })
    dispatch({ type: 'NEXT' })
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <div className="card">
        <div className="card-header">
          <div className="card-title">Filtros de Alerta</div>
          <div className="card-desc">Quais alertas serão processados e janela de deduplicação.</div>
        </div>
        <div className="card-body">
          <div className="form-field" style={{ marginBottom: 28 }}>
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
            <span className="text-muted text-sm">Clique numa severidade para ativar ou desativar.</span>
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
              <div className="text-muted text-sm">Mín: 1 min — Máx: 24 h</div>
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
