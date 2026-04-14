"""
Ferramenta /diagnostico <host> — diagnóstico completo com IA.

O que faz:
1. Coleta dados do Zabbix: problemas ativos, CPU, memória, disco, rede
2. Monta contexto rico e envia para IA analisar
3. Retorna diagnóstico formatado em MarkdownV2 para Telegram
"""
import json
import structlog
from openai import AsyncOpenAI

from app.config import get_settings
from app.tools._zabbix import zabbix_login, zabbix_call, age_str, esc, SEVERITY_EMOJI, SEVERITY_LABEL

logger = structlog.get_logger(__name__)

_METRIC_KEYS = [
    "system.cpu.util",
    "system.cpu.load[percpu,avg1]",
    "vm.memory.utilization",
    "system.swap.size[,pfree]",
    "vfs.fs.size[/,pfree]",
    "net.if.in[",
    "net.if.out[",
    "system.uptime",
]

DIAGNOSE_SYSTEM_PROMPT = """Você é um engenheiro sênior de infraestrutura e SRE especializado em diagnóstico de incidentes.

Analise os dados de monitoramento coletados do Zabbix e forneça um diagnóstico técnico conciso.

Responda APENAS em JSON válido com a seguinte estrutura:
{
  "summary": "Resumo do estado atual do host em 1-2 frases",
  "severity": "CRÍTICO|ALTO|MÉDIO|OK",
  "findings": ["Achado 1 com detalhe técnico", "Achado 2", "Achado 3"],
  "probable_causes": ["Causa mais provável", "Causa alternativa"],
  "immediate_actions": ["Ação 1 com comando se aplicável", "Ação 2", "Ação 3"],
  "monitoring_commands": ["comando_1", "comando_2", "comando_3"]
}

Seja técnico, direto e acionável. Foque no que é urgente e no que o engenheiro deve fazer primeiro."""


async def run_diagnose(settings, host: str, ai_service) -> str:
    if not host:
        return "⚠️ Uso: /diagnostico \\<host\\>\n_Exemplo: /diagnostico db\\-prod\\-01_"

    if not settings or not settings.zabbix_url or not settings.zabbix_api_password:
        return (
            f"🔍 *Diagnóstico — {esc(host)}*\n\n"
            "⚠️ Zabbix não configurado — não é possível coletar métricas\\.\n\n"
            "_Configure o Zabbix em Setup → Zabbix para diagnóstico automático\\._"
        )

    token = await zabbix_login(
        settings.zabbix_url, settings.zabbix_api_user or "Admin", settings.zabbix_api_password
    )
    if not token:
        return "❌ Não foi possível conectar ao Zabbix\\."

    # ── Resolve host ────────────────────────────────────────────────────────
    hosts = await zabbix_call(settings.zabbix_url, token, "host.get", {
        "output": ["hostid", "host", "name", "available", "error"],
        "search": {"host": host, "name": host},
        "searchWildcardsEnabled": True,
        "limit": 3,
    })
    if not hosts:
        return f"❓ Host *{esc(host)}* não encontrado no Zabbix\\."

    h = hosts[0]
    host_id = h["hostid"]
    display_host = h.get("name") or h.get("host")
    host_available = h.get("available", "0")  # 0=unknown, 1=available, 2=unavailable

    # ── Problemas ativos ─────────────────────────────────────────────────────
    problems = await zabbix_call(settings.zabbix_url, token, "problem.get", {
        "output": ["name", "severity", "clock", "acknowledged"],
        "hostids": [host_id],
        "recent": True,
        "sortfield": "severity",
        "sortorder": "DESC",
        "limit": 10,
    }) or []

    # ── Métricas recentes ─────────────────────────────────────────────────────
    items = await zabbix_call(settings.zabbix_url, token, "item.get", {
        "output": ["itemid", "name", "key_", "lastvalue", "lastclock", "units"],
        "hostids": [host_id],
        "search": {"key_": ""},
        "limit": 60,
    }) or []

    # Filtra métricas relevantes
    relevant = [
        i for i in items
        if any(k in i["key_"] for k in _METRIC_KEYS) and i.get("lastvalue")
    ]

    # ── Monta contexto para a IA ──────────────────────────────────────────────
    context_parts = [
        f"HOST: {display_host}",
        f"DISPONIBILIDADE ZABBIX: {'OK' if host_available == '1' else 'INDISPONÍVEL' if host_available == '2' else 'DESCONHECIDA'}",
        "",
        f"PROBLEMAS ATIVOS ({len(problems)}):",
    ]
    if problems:
        for p in problems:
            sev = SEVERITY_LABEL.get(str(p.get("severity", "0")), "?")
            age = age_str(p.get("clock", 0))
            ack = " [ACK]" if p.get("acknowledged") == "1" else ""
            context_parts.append(f"  - [{sev}] {p['name']} (há {age}){ack}")
    else:
        context_parts.append("  (nenhum)")

    context_parts.append("")
    context_parts.append("MÉTRICAS COLETADAS:")
    if relevant:
        for item in relevant[:20]:
            val = item.get("lastvalue", "N/A")
            units = item.get("units", "")
            age = age_str(item.get("lastclock", 0))
            context_parts.append(f"  - {item['name']}: {val}{' ' + units if units else ''} (há {age})")
    else:
        context_parts.append("  (sem métricas disponíveis)")

    context = "\n".join(context_parts)

    # ── Chama a IA ────────────────────────────────────────────────────────────
    if not ai_service:
        return _format_no_ai(display_host, problems, relevant)

    diagnosis = await _call_ai(settings, context)
    if not diagnosis:
        return _format_no_ai(display_host, problems, relevant)

    return _format_telegram(display_host, diagnosis, problems)


async def _call_ai(settings, context: str) -> dict | None:
    try:
        client = AsyncOpenAI(
            api_key=settings.ai_api_key,
            base_url=settings.ai_base_url,
        )
        response = await client.chat.completions.create(
            model=settings.ai_model,
            messages=[
                {"role": "system", "content": DIAGNOSE_SYSTEM_PROMPT},
                {"role": "user", "content": f"Analise os seguintes dados de monitoramento:\n\n{context}"},
            ],
            max_tokens=1024,
            response_format={"type": "json_object"},
            timeout=30,
        )
        raw = response.choices[0].message.content or "{}"
        return json.loads(raw)
    except Exception as exc:
        logger.warning("diagnose_tool.ai_failed", error=str(exc))
        return None


def _format_telegram(host: str, diagnosis: dict, problems: list) -> str:
    severity = diagnosis.get("severity", "?")
    sev_emoji = {"CRÍTICO": "🔴", "ALTO": "🟠", "MÉDIO": "🟡", "OK": "✅"}.get(severity, "⚪")

    lines = [f"🔍 *Diagnóstico — {esc(host)}*\n"]

    # Resumo
    summary = diagnosis.get("summary", "")
    if summary:
        lines.append(f"{sev_emoji} *{esc(severity)}* — {esc(summary)}\n")

    # Achados
    findings = diagnosis.get("findings", [])
    if findings:
        lines.append("📊 *Achados*")
        for f in findings[:5]:
            lines.append(f"  • {esc(f)}")
        lines.append("")

    # Causas
    causes = diagnosis.get("probable_causes", [])
    if causes:
        lines.append("🔎 *Causas Prováveis*")
        for c in causes[:3]:
            lines.append(f"  • {esc(c)}")
        lines.append("")

    # Ações imediatas
    actions = diagnosis.get("immediate_actions", [])
    if actions:
        lines.append("🛠️ *Ações Imediatas*")
        for i, a in enumerate(actions[:5], 1):
            lines.append(f"  {i}\\. {esc(a)}")
        lines.append("")

    # Comandos de monitoramento
    cmds = diagnosis.get("monitoring_commands", [])
    if cmds:
        lines.append("💻 *Comandos Recomendados*")
        lines.append("```")
        for cmd in cmds[:5]:
            lines.append(cmd)
        lines.append("```")

    # Problemas ativos (resumo rápido)
    if problems:
        lines.append(f"\n⚠️ *{len(problems)} problema\\(s\\) ativo\\(s\\)*")
        for p in problems[:3]:
            sev = str(p.get("severity", "0"))
            lines.append(f"  {SEVERITY_EMOJI.get(sev, '⚪')} {esc(p['name'])}")
        if len(problems) > 3:
            lines.append(f"  _\\.\\.\\. e mais {len(problems) - 3}_")

    return "\n".join(lines)


def _format_no_ai(host: str, problems: list, metrics: list) -> str:
    """Fallback quando a IA não está disponível."""
    lines = [f"🔍 *Diagnóstico — {esc(host)}*\n"]
    lines.append("⚠️ _Análise IA indisponível — dados brutos do Zabbix:_\n")

    if problems:
        lines.append(f"🚨 *{len(problems)} Problema\\(s\\) Ativo\\(s\\)*")
        for p in problems[:5]:
            sev = str(p.get("severity", "0"))
            age = age_str(p.get("clock", 0))
            lines.append(f"  {SEVERITY_EMOJI.get(sev, '⚪')} {esc(p['name'])} \\(há {esc(age)}\\)")
        lines.append("")
    else:
        lines.append("✅ _Sem problemas ativos\\._\n")

    if metrics:
        lines.append("📊 *Métricas Recentes*")
        for item in metrics[:8]:
            val = item.get("lastvalue", "N/A")
            units = item.get("units", "")
            lines.append(f"  • {esc(item['name'])}: {esc(val)}{esc(' ' + units if units else '')}")

    return "\n".join(lines)
