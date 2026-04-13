import { useQuery, useMutation } from '@tanstack/react-query'
import { RefreshCw, Send, CheckCircle, AlertCircle } from 'lucide-react'
import { useState } from 'react'
import { getStatus, testWhatsApp } from '../api/client'
import { ServiceCard } from '../components/ServiceCard'

export function StatusPage() {
  const [testMsg, setTestMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['status'],
    queryFn: getStatus,
    refetchInterval: 30_000,
  })

  const testMutation = useMutation({
    mutationFn: testWhatsApp,
    onSuccess: () => setTestMsg({ ok: true, text: 'Mensagem enviada com sucesso!' }),
    onError: (e: Error) => setTestMsg({ ok: false, text: e.message }),
  })

  const loading = isLoading ? null : undefined

  return (
    <div>
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h1 className="page-title">Status dos Serviços</h1>
            <p className="page-subtitle">Atualizado automaticamente a cada 30 segundos.</p>
          </div>
          <button
            className="btn btn-ghost"
            onClick={() => refetch()}
            disabled={isFetching}
          >
            <RefreshCw size={14} className={isFetching ? 'spinner-dark' : ''} />
            Atualizar
          </button>
        </div>
      </div>

      <div className="status-grid">
        <ServiceCard
          name="Redis"
          ok={isLoading ? null : (data?.redis.ok ?? false)}
          value={data?.redis.ok ? 'Online' : 'Offline'}
          meta={data?.redis.latency_ms != null ? `${data.redis.latency_ms} ms` : undefined}
        />
        <ServiceCard
          name="Banco de Configuração"
          ok={loading ?? (data?.database.ok ?? false)}
          value={data?.database.ok ? 'Online' : 'Offline'}
        />
        <ServiceCard
          name="Evolution API"
          ok={loading ?? (data?.evolution_api.ok ?? false)}
          value={data?.evolution_api.ok ? 'Online' : 'Offline'}
          meta={
            data?.evolution_api.instances?.length
              ? `${data.evolution_api.instances.length} instância(s)`
              : undefined
          }
        />
        <ServiceCard
          name="Provedor de IA"
          ok={loading ?? (data?.ai_provider.ok ?? false)}
          value={data?.ai_provider.ok ? 'Configurado' : 'Não configurado'}
          meta={
            data?.ai_provider.model
              ? `${data.ai_provider.provider} · ${data.ai_provider.model}`
              : undefined
          }
        />
        <ServiceCard
          name="WhatsApp"
          ok={loading ?? (data?.whatsapp_connected ?? false)}
          value={data?.whatsapp_connected ? 'Conectado' : 'Desconectado'}
          meta="Instância Evolution API"
        />
      </div>

      <div className="card">
        <div className="card-header">
          <div>
            <div className="card-title"><Send size={15} /> Testar WhatsApp</div>
            <div className="card-desc">
              Envia uma mensagem de teste para o número configurado.
            </div>
          </div>
        </div>
        <div className="card-body">
          {testMsg && (
            <div
              className="flex items-center gap-8 mt-8"
              style={{
                padding: '10px 14px',
                borderRadius: 6,
                background: testMsg.ok ? 'var(--success-light)' : 'var(--error-light)',
                color: testMsg.ok ? '#065f46' : '#991b1b',
                fontSize: 13,
                marginBottom: 14,
              }}
            >
              {testMsg.ok
                ? <CheckCircle size={15} />
                : <AlertCircle size={15} />
              }
              {testMsg.text}
            </div>
          )}

          <button
            className="btn btn-primary"
            onClick={() => { setTestMsg(null); testMutation.mutate() }}
            disabled={testMutation.isPending}
          >
            {testMutation.isPending
              ? <><div className="spinner" /> Enviando...</>
              : <><Send size={14} /> Enviar mensagem de teste</>
            }
          </button>
        </div>
      </div>
    </div>
  )
}
