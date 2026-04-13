import { useQuery } from '@tanstack/react-query'
import { useWizard, WizardProvider, STEPS, type WizardStep } from '../context/WizardContext'
import { getConfig, type Config } from '../api/client'
import { StepWelcome } from '../components/wizard/StepWelcome'
import { StepAI } from '../components/wizard/StepAI'
import { StepNotification } from '../components/wizard/StepNotification'
import { StepFilters } from '../components/wizard/StepFilters'
import { StepReview } from '../components/wizard/StepReview'
import { StepDone } from '../components/wizard/StepDone'

const PROGRESS_STEPS: { key: WizardStep; label: string }[] = [
  { key: 'ai',           label: 'Provedor IA' },
  { key: 'notification', label: 'Notificação' },
  { key: 'filters',      label: 'Filtros' },
  { key: 'review',       label: 'Revisão' },
]

/* ── Config status bar ────────────────────────────────────── */
function ConfigStatusBar({ config }: { config: Config }) {
  const hasAI    = !!(config.ai_api_key && config.ai_model)
  const hasNotif = !!(config.notification_channel)

  const notifLabel = config.notification_channel === 'telegram'
    ? 'Telegram'
    : 'WhatsApp'

  const severitiesLabel = Array.isArray(config.allowed_severities) && config.allowed_severities.length
    ? config.allowed_severities.join(', ')
    : null

  return (
    <div className="config-status-bar">
      <span className="config-status-bar-label">Status atual</span>

      <div className={`config-status-pill config-status-pill--${hasAI ? 'ok' : 'empty'}`}>
        <span className="config-status-pill-dot" />
        {hasAI ? config.ai_model : 'IA não configurada'}
      </div>

      <div className={`config-status-pill config-status-pill--${hasNotif ? 'ok' : 'empty'}`}>
        <span className="config-status-pill-dot" />
        {hasNotif ? notifLabel : 'Notificação não configurada'}
      </div>

      {severitiesLabel && (
        <div className="config-status-pill config-status-pill--ok">
          <span className="config-status-pill-dot" />
          {severitiesLabel}
        </div>
      )}
    </div>
  )
}

/* ── Wizard content ───────────────────────────────────────── */
interface WizardContentProps {
  onComplete: () => void
}

function WizardContent({ onComplete }: WizardContentProps) {
  const { state, stepIndex } = useWizard()
  const showProgress = state.step !== 'welcome' && state.step !== 'done'

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Configuração</h1>
        <p className="page-subtitle">Configure o agente em 4 passos rápidos.</p>
      </div>

      {showProgress && (
        <div className="wizard-progress">
          {PROGRESS_STEPS.map((s, i) => {
            const idx = STEPS.indexOf(s.key)
            const isActive = state.step === s.key
            const isDone   = stepIndex > idx
            return (
              <div key={s.key} className="wizard-step-item">
                {i > 0 && (
                  <div className={`wizard-connector ${isDone || isActive ? 'done' : ''}`} />
                )}
                <div className={`wizard-step-dot ${isActive ? 'active' : ''} ${isDone ? 'done' : ''}`}>
                  {isDone ? '✓' : i + 1}
                </div>
                <div className={`wizard-step-label ${isActive ? 'active' : ''}`}>{s.label}</div>
              </div>
            )
          })}
        </div>
      )}

      {state.step === 'welcome'      && <StepWelcome />}
      {state.step === 'ai'           && <StepAI />}
      {state.step === 'notification' && <StepNotification />}
      {state.step === 'filters'      && <StepFilters />}
      {state.step === 'review'       && <StepReview />}
      {state.step === 'done'         && (
        <StepDone onComplete={onComplete} onReconfigure={() => {}} />
      )}
    </div>
  )
}

/* ── SetupPage ────────────────────────────────────────────── */
export interface SetupPageProps {
  onComplete: () => void
}

export function SetupPage({ onComplete }: SetupPageProps) {
  const { data: config, isLoading } = useQuery({
    queryKey: ['config'],
    queryFn: getConfig,
  })

  if (isLoading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200 }}>
        <div className="spinner spinner-dark" style={{ width: 24, height: 24 }} />
      </div>
    )
  }

  return (
    <div className="content-constrained">
      {config && <ConfigStatusBar config={config} />}
      <WizardProvider initialData={config ?? {}}>
        <WizardContent onComplete={onComplete} />
      </WizardProvider>
    </div>
  )
}
