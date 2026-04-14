import { useQuery, useMutation } from '@tanstack/react-query'
import { RefreshCw, Send, CheckCircle, AlertCircle } from 'lucide-react'
import { useState } from 'react'
import { getStatus, testAll, getConfig, TestResult } from '../api/client'
import { ServiceCard } from '../components/ServiceCard'

function TestResultMessage({ result }: { result: TestResult }) {
  const entries = Object.entries(result.channels) as [string, { sent: boolean; message_id?: string; error?: string }][]
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14 }}>
      {entries.map(([channel, info]) => (
        <div
          key={channel}
          style={{
            padding: '10px 14px',
            borderRadius: 6,
            background: info.sent ? 'var(--success-light)' : 'var(--error-light)',
            color: info.sent ? '#065f46' : '#991b1b',
            fontSize: 13,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          {info.sent ? <CheckCircle size={15} /> : <AlertCircle size={15} />}
          <strong style={{ textTransform: 'capitalize' }}>{channel}:</strong>
          {info.sent ? ' mensagem enviada com sucesso!' : ` ${info.error}`}
        </div>
      ))}
    </div>
  )
}

export function StatusPage() {
  const [testResult, setTestResult] = useState<TestResult | null>(null)
  const [testError, setTestError] = useState<string | null>(null)

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['status'],
    queryFn: getStatus,
    refetchInterval: 30_000,
  })

  const { data: config } = useQuery({
    queryKey: ['config'],
    queryFn: getConfig,
  })

  const isTelegram = config?.notification_channel === 'telegram'

  const testMutation = useMutation({
    mutationFn: testAll,
    onSuccess: (data) => { setTestResult(data); setTestError(null) },
    onError: (e: Error) => { setTestError(e.message); setTestResult(null) },
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
          name="Provedor de IA"
          ok={loading ?? (data?.ai_provider.ok ?? false)}
          value={data?.ai_provider.ok ? 'Configurado' : 'Não configurado'}
          meta={
            data?.ai_provider.model
              ? `${data.ai_provider.provider} · ${data.ai_provider.model}`
              : undefined
          }
        />

        {/* WhatsApp card — only when channel is whatsapp */}
        {!isTelegram && (
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
        )}
        {!isTelegram && (
          <ServiceCard
            name="WhatsApp"
            ok={loading ?? (data?.whatsapp_connected ?? false)}
            value={data?.whatsapp_connected ? 'Conectado' : 'Desconectado'}
            meta="Instância Evolution API"
          />
        )}

        {/* Telegram card — only when channel is telegram */}
        {isTelegram && (
          <ServiceCard
            name="Telegram Bot"
            ok={loading ?? (data?.telegram?.ok ?? false)}
            value={data?.telegram?.ok ? 'Conectado' : 'Desconectado'}
            meta={data?.telegram?.bot_username ? `@${data.telegram.bot_username}` : undefined}
          />
        )}
      </div>

      {/* Test notification card */}
      <div className="card">
        <div className="card-header">
          <div>
            <div className="card-title">
              <Send size={15} /> Testar Notificações
            </div>
            <div className="card-desc">
              Envia uma mensagem de teste para todos os canais ativos (WhatsApp e/ou Telegram).
            </div>
          </div>
        </div>
        <div className="card-body">
          {testResult && <TestResultMessage result={testResult} />}
          {testError && (
            <div
              style={{
                padding: '10px 14px',
                borderRadius: 6,
                background: 'var(--error-light)',
                color: '#991b1b',
                fontSize: 13,
                marginBottom: 14,
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <AlertCircle size={15} />
              {testError}
            </div>
          )}

          <button
            className="btn btn-primary"
            onClick={() => {
              setTestResult(null)
              setTestError(null)
              testMutation.mutate()
            }}
            disabled={testMutation.isPending}
          >
            {testMutation.isPending ? (
              <><div className="spinner" /> Enviando...</>
            ) : (
              <><Send size={14} /> Enviar mensagem de teste</>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
