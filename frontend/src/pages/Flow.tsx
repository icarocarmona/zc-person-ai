import { useState } from 'react'
import { GitBranch, FileText } from 'lucide-react'
import { FlowTab } from '../components/flow/FlowTab'
import { PromptTab } from '../components/flow/PromptTab'

type Tab = 'flow' | 'prompt'

export function FlowPage() {
  const [tab, setTab] = useState<Tab>('flow')

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Fluxo & Prompt</h1>
        <p className="page-subtitle">
          Visualize o pipeline de alertas e edite o prompt do sistema de IA.
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
