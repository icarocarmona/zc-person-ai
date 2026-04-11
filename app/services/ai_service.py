import json
import structlog
from openai import AsyncOpenAI
from tenacity import (
    retry,
    stop_after_attempt,
    wait_exponential,
    retry_if_exception_type,
)
from openai import APITimeoutError, APIConnectionError

from app.config import get_settings
from app.models import ZabbixWebhookPayload, DiagnosticReport

logger = structlog.get_logger(__name__)

SYSTEM_PROMPT = """Você é um engenheiro sênior de infraestrutura e SRE (Site Reliability Engineer) especializado em diagnóstico e resolução de incidentes críticos de TI.

Sua função é analisar alertas críticos do Zabbix e produzir relatórios de diagnóstico claros, precisos e acionáveis em português do Brasil (pt-BR).

## Diretrizes de Análise

Ao receber um alerta, você deve:

1. **Identificar o problema real**: Vá além do nome do trigger — interprete o que o alerta significa no contexto de infraestrutura de produção.
2. **Determinar a causa provável**: Baseado no tipo de alerta, host, severidade e descrição, liste as causas mais prováveis em ordem de probabilidade.
3. **Propor remediação prática**: Forneça passos concretos e executáveis que um engenheiro possa seguir imediatamente. Inclua comandos Linux/shell quando relevante.
4. **Avaliar impacto**: Explique o impacto potencial nos usuários e nos sistemas dependentes.

## Formato de Resposta

Responda SEMPRE em JSON válido com a seguinte estrutura:

{
  "problem_description": "Descrição clara e técnica do problema em 2-3 frases",
  "probable_cause": "Causa mais provável com explicação técnica. Liste alternativas se houver",
  "remediation_steps": [
    "Passo 1: Ação imediata com comando ou procedimento específico",
    "Passo 2: Verificação adicional",
    "Passo 3: Ação corretiva",
    "Passo 4: Validação e monitoramento"
  ],
  "priority": "CRÍTICO",
  "estimated_impact": "Descrição do impacto potencial nos sistemas e usuários",
  "whatsapp_message": "Mensagem formatada completa para WhatsApp com emojis e markdown do WhatsApp (*negrito*, _itálico_)"
}

## Prioridades
- **CRÍTICO**: Serviço completamente indisponível, perda de dados, segurança comprometida
- **ALTO**: Degradação severa de performance, falha parcial de serviço
- **MÉDIO**: Aviso de capacidade, performance degradada mas funcional

## Contexto de Tipos de Alerta Comuns

- **CPU alta**: Verifique processos com top/htop, load average, possível fork bomb ou job runaway. Comandos: ps aux --sort=-%cpu | head -20
- **Memória**: OOM killer ativo, swap excessivo, leak de memória. Comandos: free -h, dmesg | grep -i oom
- **Disco**: Verificar partições, inode, crescimento de logs. Comandos: df -h, du -sh /var/log/*, find / -size +1G
- **Rede**: Perda de pacotes, latência, interface down. Comandos: ping, traceroute, ip link show, ss -tuln
- **Serviço down**: Health check falhou, processo morto, porta não responde. Comandos: systemctl status <svc>, journalctl -u <svc> -n 50
- **Database MySQL/PostgreSQL**: Locks, queries lentas, replicação atrasada. Comandos: SHOW PROCESSLIST, pg_stat_activity
- **Redis**: Memória, conexões, replicação. Comandos: redis-cli info, redis-cli slowlog get
- **SSL/TLS**: Certificado expirando ou expirado. Comandos: openssl s_client -connect host:443
- **RAID/Storage**: Disco degradado, rebuild. Comandos: cat /proc/mdstat, mdadm --detail /dev/md0
- **Docker/Container**: Container parado, OOM kill, restart loop. Comandos: docker ps -a, docker logs <id> --tail 50
- **Load Balancer/Nginx**: Upstream down, 5xx errors, worker crash. Comandos: nginx -t, tail -f /var/log/nginx/error.log
- **DNS**: Resolução falhou, NXDOMAIN. Comandos: dig, nslookup, cat /etc/resolv.conf

## Formato da whatsapp_message

Use este template para a mensagem WhatsApp (adapte ao alerta):

🔴 *ALERTA {PRIORIDADE} — ZABBIX*

🖥️ *Host*: {host}
⚠️ *Trigger*: {trigger_name}
🕐 *Horário*: {timestamp}

📋 *Problema*
{problem_description}

🔍 *Causa Provável*
{probable_cause}

🛠️ *Remediação*
  1. {passo1}
  2. {passo2}
  3. {passo3}

💥 *Impacto*: {estimated_impact}

🆔 Event: {event_id} | Trigger: {trigger_id}

Seja direto, técnico e acionável. O engenheiro que recebe este relatório precisa agir imediatamente."""


class AIService:
    def __init__(self) -> None:
        settings = get_settings()
        self._client = AsyncOpenAI(
            api_key=settings.ai_api_key,
            base_url=settings.ai_base_url,
        )
        self._model = settings.ai_model

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=2, max=10),
        retry=retry_if_exception_type((APITimeoutError, APIConnectionError)),
        reraise=True,
    )
    async def analyze_alert(self, payload: ZabbixWebhookPayload) -> DiagnosticReport:
        user_message = self._build_user_message(payload)

        logger.info(
            "ai.request_start",
            trigger_id=payload.trigger_id,
            severity=payload.severity,
            model=self._model,
        )

        response = await self._client.chat.completions.create(
            model=self._model,
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": user_message},
            ],
            max_tokens=2048,
            response_format={"type": "json_object"},
        )

        raw_content = response.choices[0].message.content or "{}"

        logger.info(
            "ai.request_complete",
            trigger_id=payload.trigger_id,
            prompt_tokens=response.usage.prompt_tokens if response.usage else 0,
            completion_tokens=response.usage.completion_tokens if response.usage else 0,
            model=response.model,
        )

        return self._parse_response(raw_content, payload)

    def _build_user_message(self, payload: ZabbixWebhookPayload) -> str:
        host_info = payload.host
        if payload.host_ip:
            host_info = f"{payload.host} ({payload.host_ip})"

        return (
            f"## Alerta Crítico do Zabbix\n\n"
            f"**Trigger ID**: {payload.trigger_id}\n"
            f"**Event ID**: {payload.event_id}\n"
            f"**Nome do Trigger**: {payload.trigger_name}\n"
            f"**Host**: {host_info}\n"
            f"**Severidade**: {payload.severity}\n"
            f"**Status**: {payload.status}\n"
            f"**Timestamp**: {payload.timestamp}\n"
            f"**Descrição**: {payload.description or 'Não fornecida'}\n"
            f"**Item Monitorado**: {payload.item_name or 'N/A'}\n"
            f"**Valor do Item**: {payload.item_value or 'N/A'}\n"
            f"**Tags**: {payload.tags or 'Nenhuma'}\n\n"
            f"Por favor, analise este alerta e forneça o diagnóstico completo em JSON."
        )

    def _parse_response(self, text: str, payload: ZabbixWebhookPayload) -> DiagnosticReport:
        try:
            data = json.loads(text)
        except json.JSONDecodeError:
            logger.warning("ai.json_parse_failed", raw_text=text[:300])
            return self._fallback_report(payload)

        whatsapp_msg = data.get("whatsapp_message") or self._format_whatsapp_message(data, payload)

        return DiagnosticReport(
            problem_description=data.get("problem_description", payload.trigger_name),
            probable_cause=data.get("probable_cause", "Desconhecida"),
            remediation_steps=data.get("remediation_steps", []),
            priority=data.get("priority", "ALTO"),
            estimated_impact=data.get("estimated_impact", ""),
            raw_text=whatsapp_msg,
        )

    def _fallback_report(self, payload: ZabbixWebhookPayload) -> DiagnosticReport:
        msg = (
            f"🟠 *ALERTA ALTO — ZABBIX*\n\n"
            f"🖥️ *Host*: {payload.host}\n"
            f"⚠️ *Trigger*: {payload.trigger_name}\n"
            f"🕐 *Horário*: {payload.timestamp}\n\n"
            f"⚠️ Análise automática indisponível no momento.\n"
            f"Por favor, verifique manualmente o host afetado.\n\n"
            f"🆔 Event: {payload.event_id} | Trigger: {payload.trigger_id}"
        )
        return DiagnosticReport(
            problem_description=payload.trigger_name,
            probable_cause="Análise automática indisponível",
            remediation_steps=["Verificar manualmente o host afetado"],
            priority="ALTO",
            estimated_impact="Indeterminado",
            raw_text=msg,
        )

    def _format_whatsapp_message(self, data: dict, payload: ZabbixWebhookPayload) -> str:
        priority = data.get("priority", "ALTO")
        emoji = {"CRÍTICO": "🔴", "ALTO": "🟠", "MÉDIO": "🟡"}.get(priority, "🟠")
        steps = "\n".join(
            f"  {i + 1}. {step}"
            for i, step in enumerate(data.get("remediation_steps", []))
        )
        host_info = payload.host
        if payload.host_ip:
            host_info = f"{payload.host} ({payload.host_ip})"

        return (
            f"{emoji} *ALERTA {priority} — ZABBIX*\n\n"
            f"🖥️ *Host*: {host_info}\n"
            f"⚠️ *Trigger*: {payload.trigger_name}\n"
            f"🕐 *Horário*: {payload.timestamp}\n\n"
            f"📋 *Problema*\n{data.get('problem_description', '')}\n\n"
            f"🔍 *Causa Provável*\n{data.get('probable_cause', '')}\n\n"
            f"🛠️ *Remediação*\n{steps}\n\n"
            f"💥 *Impacto*: {data.get('estimated_impact', '')}\n\n"
            f"🆔 Event: {payload.event_id} | Trigger: {payload.trigger_id}"
        )
