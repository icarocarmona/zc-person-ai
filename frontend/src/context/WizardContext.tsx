import React, { createContext, useContext, useReducer } from 'react'
import type { Config } from '../api/client'

export type WizardStep = 'welcome' | 'ai' | 'notification' | 'filters' | 'review' | 'done'

export const STEPS: WizardStep[] = ['welcome', 'ai', 'notification', 'filters', 'review', 'done']

export const STEP_LABELS: Record<WizardStep, string> = {
  welcome: 'Bem-vindo',
  ai: 'Provedor IA',
  notification: 'Notificação',
  filters: 'Filtros',
  review: 'Revisão',
  done: 'Concluído',
}

export interface WizardState {
  step: WizardStep
  data: Partial<Config>
}

type WizardAction =
  | { type: 'NEXT' }
  | { type: 'PREV' }
  | { type: 'GO_TO'; step: WizardStep }
  | { type: 'UPDATE'; data: Partial<Config> }

function reducer(state: WizardState, action: WizardAction): WizardState {
  switch (action.type) {
    case 'NEXT': {
      const idx = STEPS.indexOf(state.step)
      return { ...state, step: STEPS[Math.min(idx + 1, STEPS.length - 1)] }
    }
    case 'PREV': {
      const idx = STEPS.indexOf(state.step)
      return { ...state, step: STEPS[Math.max(idx - 1, 0)] }
    }
    case 'GO_TO':
      return { ...state, step: action.step }
    case 'UPDATE':
      return { ...state, data: { ...state.data, ...action.data } }
    default:
      return state
  }
}

interface WizardCtx {
  state: WizardState
  dispatch: React.Dispatch<WizardAction>
  stepIndex: number
  totalSteps: number
}

const WizardContext = createContext<WizardCtx | null>(null)

export function WizardProvider({
  children,
  initialData,
}: {
  children: React.ReactNode
  initialData?: Partial<Config>
}) {
  const [state, dispatch] = useReducer(reducer, {
    step: 'welcome',
    data: initialData ?? {},
  })
  return (
    <WizardContext.Provider
      value={{ state, dispatch, stepIndex: STEPS.indexOf(state.step), totalSteps: STEPS.length }}
    >
      {children}
    </WizardContext.Provider>
  )
}

export function useWizard() {
  const ctx = useContext(WizardContext)
  if (!ctx) throw new Error('useWizard must be inside WizardProvider')
  return ctx
}
