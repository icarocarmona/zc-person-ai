import { useState } from 'react'
import { Settings2, Activity, Zap, GitBranch, Server } from 'lucide-react'
import { SetupPage } from './pages/Setup'
import { StatusPage } from './pages/Status'
import { FlowPage } from './pages/Flow'
import { ZabbixPage } from './pages/Zabbix'

type Page = 'status' | 'setup' | 'flow' | 'zabbix'

const NAV = [
  { key: 'status' as Page,  icon: Activity,   label: 'Status' },
  { key: 'setup'  as Page,  icon: Settings2,  label: 'Configurar' },
  { key: 'zabbix' as Page,  icon: Server,     label: 'Zabbix' },
  { key: 'flow'   as Page,  icon: GitBranch,  label: 'Fluxo' },
]

export default function App() {
  const [page, setPage] = useState<Page>('status')

  return (
    <div className="layout">

      {/* ── Mobile top bar (hidden on desktop via CSS) ── */}
      <header className="mobile-header">
        <div className="mobile-header-logo">
          <div className="sidebar-logo-icon" style={{ width: 28, height: 28 }}>
            <Zap size={14} />
          </div>
          <span className="sidebar-logo-title">Zabbix Agent</span>
        </div>
      </header>

      {/* ── Desktop sidebar (hidden on mobile via CSS) ── */}
      <nav className="sidebar">
        <div className="sidebar-header">
          <div className="sidebar-logo">
            <div className="sidebar-logo-icon">
              <Zap size={15} />
            </div>
            <div className="sidebar-logo-text">
              <span className="sidebar-logo-title">Zabbix Agent</span>
              <span className="sidebar-logo-sub">Alert · AI · Notify</span>
            </div>
          </div>
        </div>

        <div className="sidebar-nav">
          {NAV.map(({ key, icon: Icon, label }) => (
            <button
              key={key}
              className={`nav-item ${page === key ? 'active' : ''}`}
              onClick={() => setPage(key)}
            >
              <Icon size={15} />
              {label}
            </button>
          ))}
        </div>
      </nav>

      {/* ── Main content ── */}
      <main className="main">
        {page === 'status' && <StatusPage />}
        {page === 'setup'  && <SetupPage onComplete={() => setPage('status')} />}
        {page === 'zabbix' && <ZabbixPage />}
        {page === 'flow'   && <FlowPage />}
      </main>

      {/* ── Mobile bottom nav (hidden on desktop via CSS) ── */}
      <nav className="bottom-nav">
        {NAV.map(({ key, icon: Icon, label }) => (
          <button
            key={key}
            className={`bottom-nav-item ${page === key ? 'active' : ''}`}
            onClick={() => setPage(key)}
          >
            <Icon size={22} />
            <span>{label}</span>
          </button>
        ))}
      </nav>

    </div>
  )
}
