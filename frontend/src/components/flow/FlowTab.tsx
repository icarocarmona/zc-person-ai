import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { GitBranch, MousePointer, Play, CheckCircle, AlertCircle } from 'lucide-react'
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  Handle,
  Position,
  MarkerType,
  type Node,
  type Edge,
  type NodeProps,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getConfig, getPipelineMetrics, type Config, type PipelineMetrics, type PipelineStage } from '../../api/client'
import { NodeInspector } from './NodeInspector'

type PipelineNodeData = {
  label: string
  sub: string
  configKey?: string
  nodeType: 'input' | 'process' | 'output'
  count?: number
  healthy?: boolean
  stage?: PipelineStage
}

function timeAgo(iso: string | null | undefined): string | null {
  if (!iso) return null
  const diff = (Date.now() - new Date(iso).getTime()) / 1000
  if (diff < 60) return `${Math.max(1, Math.floor(diff))}s`
  if (diff < 3600) return `${Math.floor(diff / 60)}min`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`
  return `${Math.floor(diff / 86400)}d`
}

/* ── Custom pipeline node ─────────────────────────────────── */
function PipelineNode({ data, selected }: NodeProps) {
  const d = data as PipelineNodeData
  return (
    <div
      className={[
        'pipeline-node',
        `pipeline-node--${d.nodeType}`,
        d.configKey ? 'pipeline-node--config' : '',
        selected ? 'pipeline-node--selected' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {d.nodeType !== 'input' && (
        <Handle type="target" position={Position.Left} className="pipeline-handle" />
      )}
      {d.healthy !== undefined && (
        <span
          className={`pipeline-node-health ${d.healthy ? 'ok' : 'err'}`}
          title={d.healthy ? 'Saudável' : 'Com falha'}
        />
      )}
      <div className="pipeline-node-label">{d.label}</div>
      <div className="pipeline-node-sub">{d.sub}</div>
      {d.count !== undefined && (
        <div className="pipeline-node-count">
          <span className="pipeline-node-count-num">{d.count}</span>
          <span className="pipeline-node-count-unit">hoje</span>
        </div>
      )}
      {d.configKey && <div className="pipeline-node-hint">clique para editar</div>}
      {d.nodeType !== 'output' && (
        <Handle type="source" position={Position.Right} className="pipeline-handle" />
      )}
    </div>
  )
}

const nodeTypes = { pipeline: PipelineNode }

/* ── Pipeline header bar ──────────────────────────────────── */
async function sendTestWebhook(): Promise<{ status: string; elapsed_seconds?: number }> {
  const payload = {
    triggerId: `test-${Date.now()}`,
    triggerName: 'Teste de fluxo (UI)',
    host: 'flow-test-host',
    hostIp: '127.0.0.1',
    severity: 'High',
    description: 'Teste disparado pelo botão da pipeline',
    eventId: `ev-${Date.now()}`,
    status: 'PROBLEM',
    timestamp: new Date().toISOString().replace('T', ' ').slice(0, 19),
    itemName: 'CPU utilization',
    itemValue: '95',
  }
  const res = await fetch('/webhook/zabbix', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    let msg = `HTTP ${res.status}`
    try { const b = await res.json(); msg = b?.detail ?? msg } catch { /* ignore */ }
    throw new Error(msg)
  }
  return res.json()
}

function PipelineHeaderBar({
  config, metrics, onTest, testing, testFeedback,
}: {
  config: Config | undefined
  metrics: PipelineMetrics | undefined
  onTest: () => void
  testing: boolean
  testFeedback: { ok: boolean; msg: string } | null
}) {
  const channel = config?.notification_channel === 'telegram' ? 'Telegram' : 'WhatsApp'
  const model = config?.ai_model ?? '—'
  const received = metrics?.stages.received.count_today ?? 0
  const notified = metrics?.stages.notified.count_today ?? 0
  const lastAt = timeAgo(metrics?.stages.received.last_event_at)
  return (
    <div className="pipeline-header">
      <div className="pipeline-header-title">
        <GitBranch size={12} />
        Pipeline de Alertas
      </div>
      <div className="pipeline-stats">
        <button
          type="button"
          className="btn btn-ghost pipeline-test-btn"
          onClick={onTest}
          disabled={testing}
          title="Dispara um alerta fictício através de toda a pipeline"
        >
          {testing ? <div className="spinner" /> : <Play size={12} />}
          {testing ? 'Enviando...' : 'Testar fluxo'}
        </button>
        {testFeedback && (
          <div className={`pipeline-test-feedback ${testFeedback.ok ? 'ok' : 'err'}`}>
            {testFeedback.ok ? <CheckCircle size={12} /> : <AlertCircle size={12} />}
            {testFeedback.msg}
          </div>
        )}
        <div className="pipeline-stat">
          <span className="pipeline-stat-value">{received}</span>
          <span>recebidos hoje</span>
        </div>
        <div className="pipeline-stat">
          <span className="pipeline-stat-value">{notified}</span>
          <span>notificados</span>
        </div>
        {lastAt && (
          <div className="pipeline-stat">
            <span className="pipeline-stat-value">há {lastAt}</span>
            <span>último evento</span>
          </div>
        )}
        <div className="pipeline-stat">
          <span className="pipeline-stat-value">{model}</span>
        </div>
        <div className="pipeline-stat">
          <span className="pipeline-stat-value">{channel}</span>
        </div>
      </div>
    </div>
  )
}

/* ── Node inspector empty state ───────────────────────────── */
function NodeInspectorEmpty() {
  return (
    <div className="node-inspector">
      <div className="node-inspector-header">
        <span className="node-inspector-title">Inspetor</span>
      </div>
      <div className="node-inspector-body">
        <div className="node-inspector-empty">
          <div className="node-inspector-empty-icon">
            <MousePointer size={18} />
          </div>
          <div className="node-inspector-empty-title">Nenhum nó selecionado</div>
          <div className="node-inspector-empty-sub">
            Clique em um nó configurável para editar suas propriedades.
          </div>
        </div>
      </div>
    </div>
  )
}

/* ── FlowTab ──────────────────────────────────────────────── */
const NODE_STAGE: Record<string, PipelineStage> = {
  zabbix:   'received',
  severity: 'filtered',
  dedup:    'deduplicated',
  ai:       'analyzed',
  notif:    'notified',
  output:   'notified',
}

// edge id → stage que dispara a pulsação (contador do estágio de destino)
const EDGE_PULSE_STAGE: Record<string, PipelineStage> = {
  e1: 'received',
  e2: 'filtered',
  e3: 'deduplicated',
  e4: 'analyzed',
  e5: 'notified',
}

export function FlowTab() {
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [testFeedback, setTestFeedback] = useState<{ ok: boolean; msg: string } | null>(null)
  const qc = useQueryClient()
  const { data: config } = useQuery({ queryKey: ['config'], queryFn: getConfig })
  const testMutation = useMutation({
    mutationFn: sendTestWebhook,
    onSuccess: (r) => {
      setTestFeedback({ ok: true, msg: `Pipeline OK (${r.elapsed_seconds ?? '—'}s)` })
      qc.invalidateQueries({ queryKey: ['pipeline-metrics'] })
      setTimeout(() => setTestFeedback(null), 5000)
    },
    onError: (e: Error) => {
      setTestFeedback({ ok: false, msg: e.message })
      setTimeout(() => setTestFeedback(null), 6000)
    },
  })
  const { data: metrics } = useQuery<PipelineMetrics>({
    queryKey: ['pipeline-metrics'],
    queryFn: getPipelineMetrics,
    refetchInterval: 3_000,
    refetchIntervalInBackground: false,
  })

  // Detecta incrementos por estágio → dispara pulso nas edges correspondentes
  const prevCounts = useRef<Record<string, number>>({})
  const [pulsing, setPulsing] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (!metrics) return
    const newPulse = new Set(pulsing)
    let changed = false
    for (const [edgeId, stage] of Object.entries(EDGE_PULSE_STAGE)) {
      const cur = metrics.stages[stage]?.count_today ?? 0
      const prev = prevCounts.current[stage]
      if (prev !== undefined && cur > prev) {
        newPulse.add(edgeId)
        changed = true
        setTimeout(() => {
          setPulsing(p => {
            const n = new Set(p); n.delete(edgeId); return n
          })
        }, 1800)
      }
      prevCounts.current[stage] = cur
    }
    if (changed) setPulsing(newPulse)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [metrics])

  const nodes: Node[] = useMemo(() => {
    const get = (s: PipelineStage) => metrics?.stages[s]
    const healthy = metrics?.redis_ok ?? true

    const countFor = (id: string): number | undefined => {
      const stage = NODE_STAGE[id]
      if (!stage) return undefined
      return get(stage)?.count_today ?? 0
    }

    return [
      {
        id: 'zabbix',
        type: 'pipeline',
        position: { x: 0, y: 80 },
        data: {
          label: 'Zabbix', sub: 'Webhook recebido', nodeType: 'input',
          count: countFor('zabbix'), healthy,
        },
        selectable: false,
      },
      {
        id: 'severity',
        type: 'pipeline',
        position: { x: 210, y: 80 },
        data: {
          label: 'Filtro', sub: 'Severidade', configKey: 'severity', nodeType: 'process',
          count: countFor('severity'), healthy,
        },
      },
      {
        id: 'dedup',
        type: 'pipeline',
        position: { x: 420, y: 80 },
        data: {
          label: 'Dedup', sub: 'Redis TTL', configKey: 'dedup', nodeType: 'process',
          count: countFor('dedup'), healthy,
        },
      },
      {
        id: 'ai',
        type: 'pipeline',
        position: { x: 630, y: 80 },
        data: {
          label: 'Análise IA',
          sub: config?.ai_model ?? 'gpt-4o',
          configKey: 'ai',
          nodeType: 'process',
          count: countFor('ai'),
          healthy,
        },
      },
      {
        id: 'notif',
        type: 'pipeline',
        position: { x: 840, y: 80 },
        data: {
          label: 'Notificação',
          sub: config?.notification_channel === 'telegram' ? 'Telegram' : 'WhatsApp',
          configKey: 'notif',
          nodeType: 'process',
          count: countFor('notif'),
          healthy,
        },
      },
      {
        id: 'output',
        type: 'pipeline',
        position: { x: 1050, y: 80 },
        data: {
          label: 'Saída',
          sub: timeAgo(get('notified')?.last_event_at) ? `há ${timeAgo(get('notified')?.last_event_at)}` : 'Alerta enviado',
          nodeType: 'output',
          count: countFor('output'),
          healthy,
        },
        selectable: false,
      },
    ]
  }, [config, metrics])

  const edges: Edge[] = useMemo(() => {
    const severities = (config?.allowed_severities ?? ['High', 'Disaster']).join(', ') || '—'
    const ttlMin = Math.round((config?.dedup_ttl_seconds ?? 1800) / 60)
    const channel = config?.notification_channel === 'telegram' ? 'Telegram' : 'WhatsApp'

    const make = (id: string, source: string, target: string, label: string): Edge => {
      const pulse = pulsing.has(id)
      return {
        id, source, target,
        type: 'smoothstep',
        animated: true,
        label,
        className: pulse ? 'edge-pulse' : undefined,
        style: {
          stroke: pulse ? 'var(--accent)' : 'var(--text-muted)',
          strokeWidth: pulse ? 3 : 1.75,
          transition: 'stroke .3s, stroke-width .3s',
        },
        labelStyle: { fill: 'var(--text)', fontSize: 10.5, fontWeight: 500, fontFamily: 'var(--font)' },
        labelBgStyle: { fill: 'var(--bg)' },
        labelBgPadding: [6, 3],
        labelBgBorderRadius: 4,
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: pulse ? 'var(--accent)' : 'var(--text-muted)',
          width: 14, height: 14,
        },
      }
    }

    return [
      make('e1', 'zabbix',   'severity', 'POST /webhook'),
      make('e2', 'severity', 'dedup',    severities),
      make('e3', 'dedup',    'ai',       `TTL ${ttlMin}min`),
      make('e4', 'ai',       'notif',    'relatório'),
      make('e5', 'notif',    'output',   channel),
    ]
  }, [config, pulsing])

  const onNodeClick = useCallback((_evt: React.MouseEvent, node: Node) => {
    const d = node.data as PipelineNodeData
    if (d.configKey) setSelectedKey(d.configKey)
  }, [])

  const isMobile          = typeof window !== 'undefined' && window.innerWidth <= 640
  const isTabletOrLarger  = typeof window !== 'undefined' && window.innerWidth > 768

  return (
    <div>
      <PipelineHeaderBar
        config={config}
        metrics={metrics}
        onTest={() => testMutation.mutate()}
        testing={testMutation.isPending}
        testFeedback={testFeedback}
      />

      <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: 14 }}>
        {/* Scroll wrapper prevents canvas from being clipped on narrow screens */}
        <div className="flow-scroll-wrapper" style={{ flex: 1, minWidth: 0 }}>
          <div
            className="flow-canvas-inner"
            style={{
              height: isMobile ? 280 : 'min(62vh, 620px)',
              minHeight: isMobile ? 280 : 460,
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius)',
              overflow: 'hidden',
              background: 'var(--surface)',
            }}
          >
            <ReactFlow
              nodes={nodes}
              edges={edges}
              nodeTypes={nodeTypes}
              onNodeClick={onNodeClick}
              fitView
              fitViewOptions={{ padding: 0.25 }}
              minZoom={0.4}
              maxZoom={1.8}
              nodesDraggable={false}
              nodesConnectable={false}
              panOnDrag
              panOnScroll
              zoomOnScroll
              zoomOnPinch
              zoomOnDoubleClick={false}
              elementsSelectable
              proOptions={{ hideAttribution: true }}
            >
              <Background color="var(--border)" gap={20} size={1} />
              <Controls
                showInteractive={false}
                showFitView
                orientation="horizontal"
                position="top-right"
                className="flow-controls"
              />
              {!isMobile && (
                <MiniMap
                  pannable
                  zoomable
                  position="bottom-left"
                  maskColor="rgba(38, 37, 30, 0.08)"
                  nodeStrokeWidth={2}
                  nodeColor={(n) => {
                    const t = (n.data as PipelineNodeData | undefined)?.nodeType
                    if (t === 'input')  return 'rgba(38, 37, 30, 0.35)'
                    if (t === 'output') return 'rgba(31, 138, 101, 0.6)'
                    return 'rgba(245, 78, 0, 0.55)'
                  }}
                  style={{
                    background: 'var(--bg)',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-sm)',
                  }}
                />
              )}
            </ReactFlow>
          </div>
        </div>

        {/* Inspector panel: selected node or empty state */}
        {selectedKey && config ? (
          <NodeInspector
            configKey={selectedKey}
            config={config}
            onClose={() => setSelectedKey(null)}
          />
        ) : (
          isTabletOrLarger && <NodeInspectorEmpty />
        )}
      </div>
    </div>
  )
}
