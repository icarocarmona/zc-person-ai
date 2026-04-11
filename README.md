# Zabbix Critical Alert Agent

Agente que recebe alertas críticos do Zabbix, analisa com IA e envia diagnóstico + soluções para o cliente via WhatsApp.

## Stack

| Serviço | Tecnologia |
|---------|-----------|
| API do agente | Python 3.12 + FastAPI |
| IA | OpenAI `gpt-4o` (ou OpenRouter — mesma SDK) |
| WhatsApp gateway | Evolution API v2 (self-hosted) |
| Deduplicação | Redis |
| Zabbix (testes locais) | Zabbix 7.0 + PostgreSQL |
| Orquestração | Docker Compose |

## Fluxo

```
Zabbix → POST /webhook/zabbix → filtro severidade → dedup Redis
    → OpenAI (diagnóstico pt-BR) → Evolution API → WhatsApp cliente
```

## Setup rápido

### 1. Configurar variáveis

```bash
cp .env.example .env
# Editar .env com suas chaves
```

Variáveis obrigatórias:

| Variável | Descrição |
|----------|-----------|
| `AI_API_KEY` | Chave OpenAI ou OpenRouter |
| `AI_BASE_URL` | `https://api.openai.com/v1` (OpenAI) ou `https://openrouter.ai/api/v1` |
| `AI_MODEL` | `gpt-4o` (OpenAI) ou `openai/gpt-4o` (OpenRouter) |
| `EVOLUTION_API_KEY` | Chave de autenticação do Evolution API |
| `WHATSAPP_DESTINATION_NUMBER` | Número destino, ex: `5511999999999` |

### 2. Subir a stack

**Produção** (sem Zabbix local):
```bash
docker compose up -d
```

**Desenvolvimento** (com Zabbix local para testes):
```bash
docker compose --profile zabbix up -d
```

Acesso ao Zabbix: http://localhost:8090 → `Admin` / `zabbix`

### 3. Conectar WhatsApp (uma vez só)

```bash
# Criar instância
curl -X POST http://localhost:8080/instance/create \
  -H "apikey: SEU_EVOLUTION_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"instanceName": "zabbix-alerts", "qrcode": true}'

# Obter QR code (escanear com WhatsApp)
curl http://localhost:8080/instance/qrcode/zabbix-alerts \
  -H "apikey: SEU_EVOLUTION_API_KEY"

# Verificar conexão
curl http://localhost:8080/instance/connectionState/zabbix-alerts \
  -H "apikey: SEU_EVOLUTION_API_KEY"
```

### 4. Configurar Zabbix

1. Importar `zabbix/media_type.json` em **Administration > Media types > Import**
2. Criar macro global `{$ZABBIX_ALERT_WEBHOOK_URL}`:
   - Produção: `http://SEU_IP:8000/webhook/zabbix`
   - Testes locais (dentro do Docker): `http://agent:8000/webhook/zabbix`
3. Criar action em **Alerts > Actions > Trigger actions** usando o media type "ZC Alert Agent"

### 5. Testar

```bash
# Health check
curl http://localhost:8000/health

# Simular alerta
curl -X POST http://localhost:8000/webhook/zabbix \
  -H "Content-Type: application/json" \
  -d '{
    "triggerId": "123",
    "triggerName": "High CPU usage on db-prod-01",
    "host": "db-prod-01",
    "hostIp": "192.168.1.10",
    "severity": "High",
    "description": "CPU usage exceeded 90% for 5 minutes",
    "eventId": "456",
    "status": "PROBLEM",
    "timestamp": "2024-01-15 02:34:17",
    "itemName": "CPU utilization",
    "itemValue": "94.3"
  }'
```

## Trocar para OpenRouter

Só mudar 3 linhas no `.env`:

```ini
AI_API_KEY=sk-or-v1-...
AI_BASE_URL=https://openrouter.ai/api/v1
AI_MODEL=openai/gpt-4o
# Outros modelos disponíveis no OpenRouter:
# AI_MODEL=anthropic/claude-sonnet-4-5
# AI_MODEL=google/gemini-pro-1.5
```

## Severidades monitoradas

Por padrão: `High` e `Disaster`. Alterar via `.env`:

```ini
ALLOWED_SEVERITIES=High,Disaster
```

## Deduplicação

Alertas iguais em janela de 30 minutos são ignorados (evita spam). Configurável:

```ini
DEDUP_TTL_SECONDS=1800
```

## Logs

```bash
docker compose logs -f agent
```
