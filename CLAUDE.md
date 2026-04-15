# CLAUDE.md — zc-person-ai

## Design System (Frontend)

> **Leia sempre antes de trabalhar no frontend.**  
> O design system completo está em [`DESIGN_SYSTEM.md`](./DESIGN_SYSTEM.md).

Resumo das regras mais críticas:
- Background: `#f2f1ed` (creme quente) — nunca `#ffffff`
- Texto: `#26251e` (quase-preto quente) — nunca `#000`
- Hover de botão: muda texto para `#cf2d56` (crimson quente)
- Bordas: `rgba(38, 37, 30, 0.1)` ou `oklab(0.263084 -0.00230259 0.0124794 / 0.1)`
- Radius: 8px botões/cards, 9999px pills
- Tipografia: CursorGothic (display), jjannon (body), berkeleyMono (código)
- Letter-spacing CursorGothic escala com tamanho: 72px→-2.16px, 36px→-0.72px, 26px→-0.325px

---

## Project Overview

**Zabbix Critical Alert Agent** — recebe alertas críticos do Zabbix, analisa com IA (OpenAI/OpenRouter) e envia relatórios diagnósticos via WhatsApp usando a Evolution API.

**Fluxo principal:**
```
POST /webhook/zabbix → Filtro de severidade → Dedup Redis → Análise OpenAI → WhatsApp / Telegram
```

## Tech Stack

- **Python 3.12** + **FastAPI** (Uvicorn/Gunicorn, 2 workers)
- **OpenAI SDK** (`AsyncOpenAI`) — compatível com OpenRouter
- **Redis 7.2** — deduplicação via `SET NX EX`
- **PostgreSQL** — persistência de configurações (`config_store.py`)
- **Evolution API v2** — gateway WhatsApp self-hosted
- **Telegram Bot API** — canal alternativo de notificação
- **React + Vite** — interface web de configuração (`frontend/`)
- **Docker Compose** — orquestração completa

Dependências principais: `openai`, `redis`, `httpx`, `pydantic-settings`, `structlog`, `tenacity`

## Estrutura do Projeto

```
app/
├── main.py              # FastAPI app + lifespan (inicializa serviços)
├── config.py            # Pydantic Settings — toda validação de env vars aqui
├── config_store.py      # Persistência de config no PostgreSQL
├── models.py            # ZabbixWebhookPayload, DiagnosticReport
├── routers/
│   ├── webhook.py       # POST /webhook/zabbix (filtro, dedup, orquestração)
│   ├── config.py        # GET/POST /config — lê e salva configuração
│   ├── status.py        # GET /api/status + POST /api/test/*
│   ├── metrics.py       # GET /metrics/pipeline
│   └── zabbix.py        # GET /api/zabbix/status + POST /api/zabbix/configure
├── services/
│   ├── ai_service.py        # Análise IA, prompt pt-BR, retry tenacity
│   ├── dedup_service.py     # Redis SET NX EX, fail-open
│   ├── whatsapp_service.py  # HTTP client Evolution API, retry tenacity
│   ├── telegram_service.py  # HTTP client Telegram Bot API
│   ├── telegram_bot.py      # Lógica do bot Telegram
│   └── metrics_service.py   # Coleta e exposição de métricas
└── tools/               # Ferramentas de diagnóstico Zabbix (uso pela IA)
    ├── _zabbix.py           # Cliente base Zabbix API
    ├── cpu_tool.py          # Métricas de CPU por host
    ├── hosts_tool.py        # Lista e status de hosts
    ├── problems_tool.py     # Problemas ativos
    └── diagnose_tool.py     # Diagnóstico completo de host
frontend/
└── src/
    ├── pages/
    │   ├── Setup.tsx        # Wizard de configuração (4 passos)
    │   ├── Status.tsx       # Dashboard de status dos serviços
    │   └── Zabbix.tsx       # Configuração do Zabbix via UI
    └── components/
        └── flow/FlowTab.tsx # Editor visual do pipeline
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

Copiar `.env.example` → `.env` e preencher (ou usar o Setup wizard na UI):

| Variável | Obrigatória | Descrição |
|---|---|---|
| `AI_API_KEY` | Sim | OpenAI ou OpenRouter API key |
| `NOTIFICATION_CHANNEL` | Não | `whatsapp` (padrão) ou `telegram` |
| `EVOLUTION_API_KEY` | Canal WhatsApp | Chave da Evolution API |
| `WHATSAPP_DESTINATION_NUMBER` | Canal WhatsApp | Telefone com DDI (só dígitos) |
| `TELEGRAM_BOT_TOKEN` | Canal Telegram | Token do bot (BotFather) |
| `TELEGRAM_CHAT_ID` | Canal Telegram | Chat ID do destino |
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
| `GET` | `/api/status` | Status detalhado de cada serviço |
| `POST` | `/api/test/whatsapp` | Envia mensagem de teste via WhatsApp |
| `POST` | `/api/test/telegram` | Envia mensagem de teste via Telegram |
| `POST` | `/api/test` | Envia teste para todos os canais ativos |
| `GET` | `/config` | Retorna configuração atual (secrets mascarados) |
| `POST` | `/config` | Salva configuração e recarrega os serviços |
| `GET` | `/metrics/pipeline` | Métricas por estágio do pipeline de alertas |
| `GET` | `/api/zabbix/status` | Verifica conexão e configuração do Zabbix |
| `POST` | `/api/zabbix/configure` | Cria/atualiza media type e action no Zabbix |
