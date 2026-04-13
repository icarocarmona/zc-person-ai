# CLAUDE.md — zc-person-ai

## Project Overview

**Zabbix Critical Alert Agent** — recebe alertas críticos do Zabbix, analisa com IA (OpenAI/OpenRouter) e envia relatórios diagnósticos via WhatsApp usando a Evolution API.

**Fluxo principal:**
```
POST /webhook/zabbix → Filtro de severidade → Dedup Redis → Análise OpenAI → Evolution API → WhatsApp
```

## Tech Stack

- **Python 3.12** + **FastAPI** (Uvicorn/Gunicorn, 2 workers)
- **OpenAI SDK** (`AsyncOpenAI`) — compatível com OpenRouter
- **Redis 7.2** — deduplicação via `SET NX EX`
- **Evolution API v2** — gateway WhatsApp self-hosted
- **Docker Compose** — orquestração completa

Dependências principais: `openai`, `redis`, `httpx`, `pydantic-settings`, `structlog`, `tenacity`

## Estrutura do Projeto

```
app/
├── main.py              # FastAPI app + lifespan (inicializa serviços)
├── config.py            # Pydantic Settings — toda validação de env vars aqui
├── models.py            # ZabbixWebhookPayload, DiagnosticReport
├── routers/
│   └── webhook.py       # POST /webhook/zabbix (filtro, dedup, orquestração)
└── services/
    ├── ai_service.py        # Análise IA, prompt em pt-BR, retry tenacity
    ├── dedup_service.py     # Redis SET NX EX, fail-open
    └── whatsapp_service.py  # HTTP client Evolution API, retry tenacity
zabbix/
└── media_type.json      # Config do webhook no Zabbix (importar via UI)
```

## Comandos de Desenvolvimento

```bash
# Iniciar stack (Redis + Evolution API + Agent)
docker compose up -d

# Iniciar com Zabbix local para testes
docker compose --profile zabbix up -d

# Logs do agent
docker compose logs -f agent

# Health check
curl http://localhost:8000/health

# Teste com payload mock
curl -X POST http://localhost:8000/webhook/zabbix \
  -H "Content-Type: application/json" \
  -d '{"triggerId":"123","triggerName":"High CPU","host":"db-prod-01","hostIp":"192.168.1.10","severity":"High","description":"CPU > 90%","eventId":"456","status":"PROBLEM","timestamp":"2024-01-15 02:34:17","itemName":"CPU utilization","itemValue":"94.3"}'
```

## Configuração (Variáveis de Ambiente)

Copiar `.env.example` → `.env` e preencher:

| Variável | Obrigatória | Descrição |
|---|---|---|
| `AI_API_KEY` | Sim | OpenAI ou OpenRouter API key |
| `EVOLUTION_API_KEY` | Sim | Chave da Evolution API |
| `WHATSAPP_DESTINATION_NUMBER` | Sim | Telefone com DDI (só dígitos) |
| `AI_BASE_URL` | Não | Default: `https://api.openai.com/v1` |
| `AI_MODEL` | Não | Default: `gpt-4o` |
| `ALLOWED_SEVERITIES` | Não | Default: `High,Disaster` |
| `DEDUP_TTL_SECONDS` | Não | Default: `1800` (30 min) |

## Convenções do Código

- **Async-first**: todos os serviços usam `async/await` (AsyncOpenAI, aioredis, httpx)
- **Logging estruturado**: `structlog` — JSON em produção, console em DEBUG
- **Retry**: decoradores `tenacity` em chamadas AI e WhatsApp (3 tentativas, backoff exponencial)
- **Fail-open**: erros do Redis não bloqueiam o pipeline (alertas passam mesmo assim)
- **Idioma**: prompt do sistema e saída WhatsApp em **português (pt-BR)**
- **Chave de dedup**: `f"dedup:{trigger_id}:{status}"`

## Trocar Provedor de IA

Apenas editar `.env` — nenhuma mudança de código necessária:

```ini
AI_BASE_URL=https://openrouter.ai/api/v1
AI_MODEL=anthropic/claude-sonnet-4-5
```

## Endpoints

| Método | Rota | Descrição |
|---|---|---|
| `POST` | `/webhook/zabbix` | Recebe alertas do Zabbix |
| `GET` | `/health` | Health check dos serviços |
