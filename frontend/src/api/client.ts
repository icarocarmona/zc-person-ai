export interface ZabbixStatus {
  connected: boolean
  configured: boolean
  media_type: boolean
  action: boolean
  action_enabled?: boolean
  error?: string
}

export interface Config {
  ai_api_key: string
  ai_base_url: string
  ai_model: string
  notification_channel: 'whatsapp' | 'telegram'
  evolution_api_key: string
  evolution_instance_name: string
  evolution_base_url: string
  whatsapp_destination_number: string
  telegram_bot_token: string
  telegram_chat_id: string
  redis_url: string
  log_level: string
  dedup_ttl_seconds: number
  allowed_severities: string[]
  system_prompt: string
  zabbix_url: string
  zabbix_api_user: string
  zabbix_api_password: string
}

export interface ServiceStatus {
  redis: { ok: boolean; latency_ms?: number | null }
  database: { ok: boolean }
  evolution_api: { ok: boolean; instances?: string[] }
  ai_provider: { ok: boolean; provider?: string; model?: string }
  whatsapp_connected: boolean
  telegram: { ok: boolean; bot_username?: string | null; enabled: boolean }
}

export interface PromptData {
  system_prompt: string
  is_default: boolean
  default_prompt: string
}

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let message = `HTTP ${res.status}`
    try {
      const body = await res.json()
      message = body?.detail ?? message
    } catch { /* ignore */ }
    throw new Error(message)
  }
  return res.json() as Promise<T>
}

export async function getConfig(): Promise<Config> {
  return handleResponse<Config>(await fetch('/api/config'))
}

export type PipelineStage = 'received' | 'filtered' | 'deduplicated' | 'analyzed' | 'notified' | 'failed'

export interface PipelineStageMetric {
  count_today: number
  last_event_at: string | null
  ok: boolean
}

export interface PipelineMetrics {
  stages: Record<PipelineStage, PipelineStageMetric>
  redis_ok: boolean
}

export async function getPipelineMetrics(): Promise<PipelineMetrics> {
  return handleResponse<PipelineMetrics>(await fetch('/metrics/pipeline'))
}

export async function saveConfig(data: Partial<Config>): Promise<{ status: string; reloaded: boolean }> {
  return handleResponse(await fetch('/api/config', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  }))
}

export async function getStatus(): Promise<ServiceStatus> {
  return handleResponse<ServiceStatus>(await fetch('/api/status'))
}

export interface ChannelResult {
  sent: boolean
  message_id?: string
  error?: string
}

export interface TestResult {
  status: 'sent' | 'partial'
  channels: {
    telegram?: ChannelResult
    whatsapp?: ChannelResult
  }
}

export async function testWhatsApp(): Promise<{ status: string; message_id: string }> {
  return handleResponse(await fetch('/api/test/whatsapp', { method: 'POST' }))
}

export async function testTelegram(): Promise<{ status: string; message_id: string }> {
  return handleResponse(await fetch('/api/test/telegram', { method: 'POST' }))
}

export async function testAll(): Promise<TestResult> {
  return handleResponse<TestResult>(await fetch('/api/test', { method: 'POST' }))
}

export async function getPrompt(): Promise<PromptData> {
  return handleResponse<PromptData>(await fetch('/api/prompt'))
}

export async function savePrompt(system_prompt: string): Promise<{ status: string; reloaded: boolean }> {
  return handleResponse(await fetch('/api/prompt', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ system_prompt }),
  }))
}

export async function resetPrompt(): Promise<{ status: string; reloaded: boolean }> {
  return handleResponse(await fetch('/api/prompt/reset', { method: 'POST' }))
}

export async function getZabbixStatus(): Promise<ZabbixStatus> {
  return handleResponse<ZabbixStatus>(await fetch('/api/zabbix/status'))
}

export async function configureZabbix(): Promise<{ status: string; results: Record<string, string> }> {
  return handleResponse(await fetch('/api/zabbix/configure', { method: 'POST' }))
}
