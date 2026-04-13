import { useState } from 'react'
import { Settings2, Activity, Zap } from 'lucide-react'
import { SetupPage } from './pages/Setup'
import { StatusPage } from './pages/Status'

type Page = 'setup' | 'status'

export default function App() {
  const [page, setPage] = useState<Page>('status')

  return (
    <div className="layout">
      {/* ── Sidebar ── */}
      <nav className="sidebar">
        <div className="sidebar-header">
          <div className="sidebar-logo">
            <div className="sidebar-logo-icon">
              <Zap size={16} />
            </div>
            <div className="sidebar-logo-text">
              <span className="sidebar-logo-title">Zabbix Agent</span>
              <span className="sidebar-logo-sub">Alert · AI · WhatsApp</span>
            </div>
          </div>
        </div>

        <div className="sidebar-nav">
          <button
            className={`nav-item ${page === 'status' ? 'active' : ''}`}
            onClick={() => setPage('status')}
          >
            <Activity size={15} />
            Status
          </button>
          <button
            className={`nav-item ${page === 'setup' ? 'active' : ''}`}
            onClick={() => setPage('setup')}
          >
            <Settings2 size={15} />
            Configuração
          </button>
        </div>
      </nav>

      {/* ── Main ── */}
      <main className="main">
        {page === 'status' ? <StatusPage /> : <SetupPage />}
      </main>
    </div>
  )
}
