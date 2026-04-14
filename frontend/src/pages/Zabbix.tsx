import { useQuery, useMutation } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { RefreshCw, Wand2, CheckCircle, AlertCircle, Loader } from 'lucide-react'
import { useState, useEffect } from 'react'
import { getZabbixStatus, configureZabbix, getConfig, saveConfig } from '../api/client'
import { ServiceCard } from '../components/ServiceCard'

interface ZabbixForm {
  zabbix_url: string
  zabbix_api_user: string
  zabbix_api_password: string
}

export function ZabbixPage() {
  const [saveMsg, setSaveMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [configureMsg, setConfigureMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const { data: config } = useQuery({ queryKey: ['config'], queryFn: getConfig })

  const { data: status, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['zabbix-status'],
    queryFn: getZabbixStatus,
    refetchInterval: 30_000,
  })

  const { register, handleSubmit, reset, formState: { isDirty } } = useForm<ZabbixForm>({
    defaultValues: { zabbix_url: '', zabbix_api_user: 'Admin', zabbix_api_password: '' },
  })

  useEffect(() => {
    if (config) {
      reset({
        zabbix_url: config.zabbix_url ?? '',
        zabbix_api_user: config.zabbix_api_user ?? 'Admin',
        zabbix_api_password: config.zabbix_api_password ?? '',
      })
    }
  }, [config, reset])

  const saveMutation = useMutation({
    mutationFn: (data: ZabbixForm) => saveConfig(data),
    onSuccess: () => {
      setSaveMsg({ ok: true, text: 'Configuração salva. Testando conexão...' })
      refetch()
    },
    onError: (e: Error) => setSaveMsg({ ok: false, text: e.message }),
  })

  const configureMutation = useMutation({
    mutationFn: configureZabbix,
    onSuccess: (data) => {
      const r = data.results
      const parts = Object.entries(r).map(([k, v]) => `${k}: ${v}`).join(' · ')
      setConfigureMsg({ ok: true, text: `Configurado com sucesso — ${parts}` })
      refetch()
    },
    onError: (e: Error) => setConfigureMsg({ ok: false, text: e.message }),
  })

  const onSave = (data: ZabbixForm) => {
    setSaveMsg(null)
    saveMutation.mutate(data)
  }

  const loading = isLoading ? null : undefined

  return (
    <div>
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h1 className="page-title">Integração Zabbix</h1>
            <p className="page-subtitle">Configure a conexão e auto-instale media type e action.</p>
          </div>
          <button className="btn btn-ghost" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw size={14} className={isFetching ? 'spinner-dark' : ''} />
            Atualizar
          </button>
        </div>
      </div>

      {/* Status cards */}
      <div className="status-grid">
        <ServiceCard
          name="Zabbix"
          ok={loading ?? (status?.connected ?? false)}
          value={status?.connected ? 'Conectado' : (status?.error ? 'Erro' : 'Desconectado')}
          meta={status?.error ? status.error.slice(0, 60) : undefined}
        />
        <ServiceCard
          name="Media Type"
          ok={loading ?? (status?.media_type ?? false)}
          value={status?.media_type ? 'Instalado' : 'Não instalado'}
          meta="ZC Alert Agent"
        />
        <ServiceCard
          name="Action"
          ok={loading ?? (status?.action_enabled ?? false)}
          value={status?.action ? (status.action_enabled ? 'Ativa' : 'Desabilitada') : 'Não criada'}
          meta="ZC Alert — Enviar para Agent"
        />
      </div>

      {/* Auto-configure */}
      {status?.connected && !status.configured && (
        <div className="card" style={{ borderColor: 'var(--warning)', marginBottom: 16 }}>
          <div className="card-header">
            <div>
              <div className="card-title"><Wand2 size={15} /> Auto-configurar Zabbix</div>
              <div className="card-desc">
                Cria/atualiza o media type "ZC Alert Agent" e a action de alertas automaticamente.
              </div>
            </div>
          </div>
          <div className="card-body">
            {configureMsg && (
              <div style={{
                padding: '10px 14px', borderRadius: 6, marginBottom: 14, fontSize: 13,
                display: 'flex', alignItems: 'center', gap: 8,
                background: configureMsg.ok ? 'var(--success-light)' : 'var(--error-light)',
                color: configureMsg.ok ? '#065f46' : '#991b1b',
              }}>
                {configureMsg.ok ? <CheckCircle size={15} /> : <AlertCircle size={15} />}
                {configureMsg.text}
              </div>
            )}
            <button
              className="btn btn-primary"
              onClick={() => { setConfigureMsg(null); configureMutation.mutate() }}
              disabled={configureMutation.isPending}
            >
              {configureMutation.isPending
                ? <><Loader size={14} className="spinner" /> Configurando...</>
                : <><Wand2 size={14} /> Auto-configurar agora</>}
            </button>
          </div>
        </div>
      )}

      {status?.connected && status.configured && (
        <div className="card" style={{ borderColor: 'var(--success)', marginBottom: 16 }}>
          <div className="card-body" style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#065f46' }}>
            <CheckCircle size={16} />
            <span style={{ fontSize: 14 }}>
              Zabbix totalmente configurado — alertas serão entregues via {config?.notification_channel ?? '...'}.
            </span>
            <button
              className="btn btn-ghost"
              style={{ marginLeft: 'auto', fontSize: 12 }}
              onClick={() => { setConfigureMsg(null); configureMutation.mutate() }}
              disabled={configureMutation.isPending}
            >
              <RefreshCw size={12} /> Reaplicar
            </button>
          </div>
          {configureMsg && (
            <div style={{ padding: '0 16px 12px', fontSize: 13, color: configureMsg.ok ? '#065f46' : '#991b1b' }}>
              {configureMsg.text}
            </div>
          )}
        </div>
      )}

      {/* Credentials form */}
      <form onSubmit={handleSubmit(onSave)}>
        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title">Conexão com o Zabbix</div>
              <div className="card-desc">URL e credenciais para acessar a API do Zabbix.</div>
            </div>
          </div>
          <div className="card-body">
            <div className="form-grid">
              <div className="form-field full">
                <label>URL do Zabbix</label>
                <input
                  {...register('zabbix_url')}
                  placeholder="http://localhost:8090"
                />
                <span className="label-hint">
                  Use <code>http://zabbix-web:8080</code> se o Zabbix estiver no mesmo Docker Compose
                </span>
              </div>

              <div className="form-field">
                <label>Usuário</label>
                <input {...register('zabbix_api_user')} placeholder="Admin" />
              </div>

              <div className="form-field">
                <label>Senha</label>
                <input type="password" {...register('zabbix_api_password')} placeholder="••••••••" autoComplete="current-password" />
              </div>
            </div>

            {saveMsg && (
              <div style={{
                padding: '10px 14px', borderRadius: 6, marginTop: 14, fontSize: 13,
                display: 'flex', alignItems: 'center', gap: 8,
                background: saveMsg.ok ? 'var(--success-light)' : 'var(--error-light)',
                color: saveMsg.ok ? '#065f46' : '#991b1b',
              }}>
                {saveMsg.ok ? <CheckCircle size={15} /> : <AlertCircle size={15} />}
                {saveMsg.text}
              </div>
            )}
          </div>

          <div className="card-footer" style={{ padding: '12px 16px', borderTop: '1px solid var(--border)', display: 'flex', gap: 8 }}>
            <button type="submit" className="btn btn-primary" disabled={saveMutation.isPending || !isDirty}>
              {saveMutation.isPending ? <><Loader size={14} className="spinner" /> Salvando...</> : 'Salvar'}
            </button>
          </div>
        </div>
      </form>
    </div>
  )
}
