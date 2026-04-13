import { useCallback, useMemo, useState } from 'react'
import {
  ReactFlow,
  Background,
  Handle,
  Position,
  type Node,
  type Edge,
  type NodeProps,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { useQuery } from '@tanstack/react-query'
import { getConfig } from '../../api/client'
import { NodeInspector } from './NodeInspector'

type PipelineNodeData = {
  label: string
  sub: string
  configKey?: string
  nodeType: 'input' | 'process' | 'output'
}

/* ── Custom node ──────────────────────────────────────────── */
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
      <div className="pipeline-node-label">{d.label}</div>
      <div className="pipeline-node-sub">{d.sub}</div>
      {d.configKey && <div className="pipeline-node-hint">clique para editar</div>}
      {d.nodeType !== 'output' && (
        <Handle type="source" position={Position.Right} className="pipeline-handle" />
      )}
    </div>
  )
}

const nodeTypes = { pipeline: PipelineNode }

/* ── FlowTab ──────────────────────────────────────────────── */
export function FlowTab() {
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const { data: config } = useQuery({ queryKey: ['config'], queryFn: getConfig })

  const nodes: Node[] = useMemo(
    () => [
      {
        id: 'zabbix',
        type: 'pipeline',
        position: { x: 0, y: 80 },
        data: { label: 'Zabbix', sub: 'Webhook recebido', nodeType: 'input' },
        selectable: false,
      },
      {
        id: 'severity',
        type: 'pipeline',
        position: { x: 210, y: 80 },
        data: { label: 'Filtro', sub: 'Severidade', configKey: 'severity', nodeType: 'process' },
      },
      {
        id: 'dedup',
        type: 'pipeline',
        position: { x: 420, y: 80 },
        data: { label: 'Dedup', sub: 'Redis TTL', configKey: 'dedup', nodeType: 'process' },
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
        },
      },
      {
        id: 'notif',
        type: 'pipeline',
        position: { x: 840, y: 80 },
        data: {
          label: 'Notificação',
          sub:
            config?.notification_channel === 'telegram' ? 'Telegram' : 'WhatsApp',
          configKey: 'notif',
          nodeType: 'process',
        },
      },
      {
        id: 'output',
        type: 'pipeline',
        position: { x: 1050, y: 80 },
        data: { label: 'Saída', sub: 'Alerta enviado', nodeType: 'output' },
        selectable: false,
      },
    ],
    [config]
  )

  const edges: Edge[] = useMemo(
    () => [
      { id: 'e1', source: 'zabbix', target: 'severity', type: 'smoothstep', animated: true, style: { stroke: 'var(--primary)', strokeWidth: 2 } },
      { id: 'e2', source: 'severity', target: 'dedup', type: 'smoothstep', animated: true, style: { stroke: 'var(--primary)', strokeWidth: 2 } },
      { id: 'e3', source: 'dedup', target: 'ai', type: 'smoothstep', animated: true, style: { stroke: 'var(--primary)', strokeWidth: 2 } },
      { id: 'e4', source: 'ai', target: 'notif', type: 'smoothstep', animated: true, style: { stroke: 'var(--primary)', strokeWidth: 2 } },
      { id: 'e5', source: 'notif', target: 'output', type: 'smoothstep', animated: true, style: { stroke: 'var(--primary)', strokeWidth: 2 } },
    ],
    []
  )

  const onNodeClick = useCallback((_evt: React.MouseEvent, node: Node) => {
    const d = node.data as PipelineNodeData
    if (d.configKey) setSelectedKey(d.configKey)
  }, [])

  return (
    <div style={{ display: 'flex', gap: 16 }}>
      <div
        style={{
          flex: 1,
          height: 320,
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
          fitViewOptions={{ padding: 0.3 }}
          nodesDraggable={false}
          nodesConnectable={false}
          panOnDrag={false}
          zoomOnScroll={false}
          zoomOnDoubleClick={false}
          elementsSelectable
          proOptions={{ hideAttribution: true }}
        >
          <Background color="var(--border)" gap={20} size={1} />
        </ReactFlow>
      </div>

      {selectedKey && config && (
        <NodeInspector
          configKey={selectedKey}
          config={config}
          onClose={() => setSelectedKey(null)}
        />
      )}
    </div>
  )
}
