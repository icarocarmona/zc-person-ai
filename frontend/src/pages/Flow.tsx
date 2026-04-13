import { useState } from 'react'
import { GitBranch, FileText } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { FlowTab } from '../components/flow/FlowTab'
import { PromptTab } from '../components/flow/PromptTab'
import { getConfig } from '../api/client'

type Tab = 'flow' | 'prompt'

export function FlowPage() {
  const [tab, setTab] = useState<Tab>('flow')
  const { data: config } = useQuery({ queryKey: ['config'], queryFn: getConfig })
  const isConfigured = !!(config?.ai_api_key && config?.notification_channel)

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Fluxo & Prompt</h1>
        <p className="page-subtitle">
          Visualize o pipeline de alertas e edite o prompt do sistema de IA.
          {isConfigured && (
            <span
              className="badge badge-green"
              style={{ marginLeft: 8, verticalAlign: 'middle' }}
            >
              Configurado
            </span>
          )}
        </p>
      </div>

      <div className="tab-bar">
        <button
          className={`tab-btn ${tab === 'flow' ? 'active' : ''}`}
          onClick={() => setTab('flow')}
        >
          <GitBranch size={14} />
          Fluxo
        </button>
        <button
          className={`tab-btn ${tab === 'prompt' ? 'active' : ''}`}
          onClick={() => setTab('prompt')}
        >
          <FileText size={14} />
          Prompt
        </button>
      </div>

      {tab === 'flow' ? <FlowTab /> : <PromptTab />}
    </div>
  )
}
