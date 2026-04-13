COMPOSE  = docker compose
FRONTEND = cd frontend &&

.DEFAULT_GOAL := help

# ─────────────────────────────────────────────────────────────────────────────
# Help
# ─────────────────────────────────────────────────────────────────────────────

.PHONY: help
help:
	@echo ""
	@echo "  Zabbix Alert Agent — comandos disponíveis"
	@echo ""
	@echo "  Setup"
	@echo "    make setup          Cria .env a partir do .env.example (se não existir)"
	@echo "    make install-ui     Instala dependências do frontend (npm install)"
	@echo ""
	@echo "  Docker"
	@echo "    make up             Sobe todos os serviços em background"
	@echo "    make down           Para e remove os containers"
	@echo "    make restart        Para e sobe novamente"
	@echo "    make build          Reconstrói a imagem do agent"
	@echo "    make logs           Tail dos logs do agent"
	@echo "    make logs-all       Tail dos logs de todos os serviços"
	@echo "    make ps             Lista containers em execução"
	@echo ""
	@echo "  Desenvolvimento"
	@echo "    make dev-ui         Sobe o frontend Vite em modo dev (http://localhost:5173)"
	@echo "    make dev            Sobe containers + frontend dev juntos"
	@echo ""
	@echo "  Testes / Debug"
	@echo "    make health         Checa o endpoint /health do agent"
	@echo "    make alert-test     Envia um alerta de teste para o webhook"
	@echo "    make zabbix-up      Sobe stack completa com Zabbix local (--profile zabbix)"
	@echo "    make zabbix-down    Para a stack do Zabbix"
	@echo ""
	@echo "  Limpeza"
	@echo "    make clean          Para containers e remove volumes de dados"
	@echo "    make clean-all      clean + remove imagens construídas localmente"
	@echo ""

# ─────────────────────────────────────────────────────────────────────────────
# Setup
# ─────────────────────────────────────────────────────────────────────────────

.PHONY: setup
setup:
	@if [ ! -f .env ]; then \
		cp .env.example .env; \
		echo ""; \
		echo "  ✔  .env criado. Edite com suas chaves antes de rodar 'make up':"; \
		echo ""; \
		echo "     AI_API_KEY                  sua chave OpenAI ou OpenRouter"; \
		echo "     EVOLUTION_API_KEY           chave da Evolution API"; \
		echo "     WHATSAPP_DESTINATION_NUMBER número de destino (ex: 5511999999999)"; \
		echo ""; \
	else \
		echo "  .env já existe — nenhuma alteração feita."; \
	fi

.PHONY: install-ui
install-ui:
	$(FRONTEND) npm install

# ─────────────────────────────────────────────────────────────────────────────
# Docker
# ─────────────────────────────────────────────────────────────────────────────

.PHONY: up
up: _check-env
	$(COMPOSE) up -d
	@echo ""
	@echo "  Serviços no ar:"
	@echo "    Agent UI   →  http://localhost:8000"
	@echo "    Evolution  →  http://localhost:8080"
	@echo ""
	@echo "  Para acompanhar os logs: make logs"

.PHONY: down
down:
	$(COMPOSE) down

.PHONY: restart
restart: down up

.PHONY: build
build:
	$(COMPOSE) build agent

.PHONY: logs
logs:
	$(COMPOSE) logs -f agent

.PHONY: logs-all
logs-all:
	$(COMPOSE) logs -f

.PHONY: ps
ps:
	$(COMPOSE) ps

# ─────────────────────────────────────────────────────────────────────────────
# Desenvolvimento
# ─────────────────────────────────────────────────────────────────────────────

.PHONY: dev-ui
dev-ui: install-ui
	$(FRONTEND) npm run dev

.PHONY: dev
dev: _check-env
	$(COMPOSE) up -d redis postgres-config evolution-api
	@echo "  Containers de suporte no ar. Iniciando frontend dev..."
	$(FRONTEND) npm run dev

# ─────────────────────────────────────────────────────────────────────────────
# Testes / Debug
# ─────────────────────────────────────────────────────────────────────────────

.PHONY: health
health:
	@curl -s http://localhost:8000/health | python3 -m json.tool || \
		echo "Agent não está respondendo. Rode 'make up' primeiro."

.PHONY: alert-test
alert-test:
	@echo "  Enviando alerta de teste para o webhook..."
	@curl -s -X POST http://localhost:8000/webhook/zabbix \
		-H "Content-Type: application/json" \
		-d '{ \
			"triggerId":  "999", \
			"triggerName": "High CPU usage on db-prod-01", \
			"host":        "db-prod-01", \
			"hostIp":      "192.168.1.10", \
			"severity":    "High", \
			"description": "CPU usage exceeded 90% for 5 minutes", \
			"eventId":     "888", \
			"status":      "PROBLEM", \
			"timestamp":   "2024-01-15 02:34:17", \
			"itemName":    "CPU utilization", \
			"itemValue":   "94.3" \
		}' | python3 -m json.tool

.PHONY: zabbix-up
zabbix-up: _check-env
	$(COMPOSE) --profile zabbix up -d
	@echo ""
	@echo "  Stack Zabbix no ar:"
	@echo "    Zabbix Web  →  http://localhost:8090  (Admin / zabbix)"
	@echo "    Agent UI    →  http://localhost:8000"
	@echo ""

.PHONY: zabbix-down
zabbix-down:
	$(COMPOSE) --profile zabbix down

# ─────────────────────────────────────────────────────────────────────────────
# Limpeza
# ─────────────────────────────────────────────────────────────────────────────

.PHONY: clean
clean:
	$(COMPOSE) --profile zabbix down -v
	@echo "  Containers e volumes removidos."

.PHONY: clean-all
clean-all: clean
	$(COMPOSE) --profile zabbix down --rmi local
	@echo "  Imagens locais removidas."

# ─────────────────────────────────────────────────────────────────────────────
# Interno
# ─────────────────────────────────────────────────────────────────────────────

.PHONY: _check-env
_check-env:
	@if [ ! -f .env ]; then \
		echo ""; \
		echo "  Erro: .env não encontrado. Rode primeiro:"; \
		echo ""; \
		echo "    make setup"; \
		echo ""; \
		exit 1; \
	fi
