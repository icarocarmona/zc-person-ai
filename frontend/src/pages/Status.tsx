import { useQuery, useMutation } from '@tanstack/react-query'
import { RefreshCw, Send, MessageSquare, CheckCircle, AlertCircle } from 'lucide-react'
import { useState } from 'react'
import { getStatus, testWhatsApp, testTelegram, getConfig } from '../api/client'
import { ServiceCard } from '../components/ServiceCard'

export function StatusPage() {
  const [testMsg, setTestMsg] = useState<{ ok: boolean; text: string } | null>(null)

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

  const testWAMutation = useMutation({
    mutationFn: testWhatsApp,
    onSuccess: () => setTestMsg({ ok: true, text: 'Mensagem enviada com sucesso!' }),
    onError: (e: Error) => setTestMsg({ ok: false, text: e.message }),
  })

  const testTGMutation = useMutation({
    mutationFn: testTelegram,
    onSuccess: () => setTestMsg({ ok: true, text: 'Mensagem enviada via Telegram!' }),
    onError: (e: Error) => setTestMsg({ ok: false, text: e.message }),
  })

  const testMutation = isTelegram ? testTGMutation : testWAMutation

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
              {isTelegram ? <><MessageSquare size={15} /> Testar Telegram</> : <><Send size={15} /> Testar WhatsApp</>}
            </div>
            <div className="card-desc">
              {isTelegram
                ? 'Envia uma mensagem de teste para o chat configurado.'
                : 'Envia uma mensagem de teste para o número configurado.'}
            </div>
          </div>
        </div>
        <div className="card-body">
          {testMsg && (
            <div
              style={{
                padding: '10px 14px',
                borderRadius: 6,
                background: testMsg.ok ? 'var(--success-light)' : 'var(--error-light)',
                color: testMsg.ok ? '#065f46' : '#991b1b',
                fontSize: 13,
                marginBottom: 14,
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              {testMsg.ok ? <CheckCircle size={15} /> : <AlertCircle size={15} />}
              {testMsg.text}
            </div>
          )}

          <button
            className="btn btn-primary"
            onClick={() => {
              setTestMsg(null)
              testMutation.mutate()
            }}
            disabled={testMutation.isPending}
          >
            {testMutation.isPending ? (
              <><div className="spinner" /> Enviando...</>
            ) : isTelegram ? (
              <><MessageSquare size={14} /> Enviar mensagem de teste</>
            ) : (
              <><Send size={14} /> Enviar mensagem de teste</>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
