export interface Config {
  ai_api_key: string
  ai_base_url: string
  ai_model: string
  evolution_api_key: string
  evolution_instance_name: string
  evolution_base_url: string
  whatsapp_destination_number: string
  redis_url: string
  log_level: string
  dedup_ttl_seconds: number
  allowed_severities: string[]
}

export interface ServiceStatus {
  redis: { ok: boolean; latency_ms?: number | null }
  database: { ok: boolean }
  evolution_api: { ok: boolean; instances?: string[] }
  ai_provider: { ok: boolean; provider?: string; model?: string }
  whatsapp_connected: boolean
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
  const res = await fetch('/api/config')
  return handleResponse<Config>(res)
}

export async function saveConfig(data: Partial<Config>): Promise<{ status: string; reloaded: boolean }> {
  const res = await fetch('/api/config', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  return handleResponse(res)
}

export async function getStatus(): Promise<ServiceStatus> {
  const res = await fetch('/api/status')
  return handleResponse<ServiceStatus>(res)
}

export async function testWhatsApp(): Promise<{ status: string; message_id: string }> {
  const res = await fetch('/api/test/whatsapp', { method: 'POST' })
  return handleResponse(res)
}
