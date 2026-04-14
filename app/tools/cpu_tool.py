"""
Ferramenta /cpu [host] — análise de CPU.

O que faz:
1. Busca valor atual de CPU no Zabbix (system.cpu.util)
2. Mostra tendência das últimas 6 leituras
3. Lista processos por consumo de CPU (proc.cpu.util[*] se disponíveis)
4. Exibe problemas ativos relacionados ao host
5. Entrega comandos prontos para investigação manual
"""
from app.tools._zabbix import zabbix_login, zabbix_call, age_str, esc, SEVERITY_EMOJI, SEVERITY_LABEL

# Chaves Zabbix que indicam utilização de CPU
_CPU_KEYS = ["system.cpu.util", "system.cpu.load[percpu,avg1]", "system.cpu.load[all,avg1]"]


async def run_cpu(settings, host: str | None) -> str:
    if not settings or not settings.zabbix_url or not settings.zabbix_api_password:
        return _no_zabbix_msg(host)

    token = await zabbix_login(
        settings.zabbix_url, settings.zabbix_api_user or "Admin", settings.zabbix_api_password
    )
    if not token:
        return "❌ Não foi possível conectar ao Zabbix\\."

    # ── Resolve host ────────────────────────────────────────────────────────
    host_filter: dict = {}
    if host:
        hosts = await zabbix_call(settings.zabbix_url, token, "host.get", {
            "output": ["hostid", "host", "name"],
            "search": {"host": host, "name": host},
            "searchWildcardsEnabled": True,
            "limit": 5,
        })
        if not hosts:
            return f"❓ Host *{esc(host)}* não encontrado no Zabbix\\.\n\n_Use /problemas para ver os hosts monitorados\\._"
        host_filter = {"hostids": [h["hostid"] for h in hosts]}
        display_host = hosts[0].get("name") or hosts[0].get("host")
    else:
        display_host = "todos os hosts"

    # ── Itens de CPU ────────────────────────────────────────────────────────
    cpu_items = await zabbix_call(settings.zabbix_url, token, "item.get", {
        "output": ["itemid", "name", "key_", "lastvalue", "lastclock", "units", "hostid"],
        "search": {"key_": "cpu"},
        "searchWildcardsEnabled": True,
        **host_filter,
        "limit": 30,
    }) or []

    # Filtra pelos itens de utilização geral
    util_items = [i for i in cpu_items if any(k in i["key_"] for k in _CPU_KEYS)]
    proc_items = [i for i in cpu_items if "proc.cpu" in i["key_"] or "proc.num" in i["key_"]]

    lines = [f"⚡ *Análise de CPU — {esc(display_host)}*\n"]

    # ── Utilização atual ─────────────────────────────────────────────────────
    if util_items:
        for item in util_items[:3]:
            val = _fmt_val(item.get("lastvalue"), item.get("units", "%"))
            age = age_str(item.get("lastclock", 0))
            lines.append(f"📊 *Utilização:* {esc(val)}  \\(_atualizado há {esc(age)}_\\)")

        # Tendência: últimas 6 leituras
        history = await zabbix_call(settings.zabbix_url, token, "history.get", {
            "output": "extend",
            "itemids": [util_items[0]["itemid"]],
            "sortfield": "clock",
            "sortorder": "DESC",
            "limit": 6,
        }) or []
        if len(history) >= 2:
            vals = [round(float(h["value"]), 1) for h in reversed(history)]
            trend_str = " → ".join(f"{v}%" for v in vals)
            direction = "↗️ subindo" if vals[-1] > vals[0] + 5 else ("↘️ caindo" if vals[-1] < vals[0] - 5 else "➡️ estável")
            lines.append(f"📈 *Tendência:* {esc(trend_str)}")
            lines.append(f"   {direction}\n")
    else:
        lines.append("📊 _Itens de CPU não encontrados para este host\\._\n")

    # ── Processos por CPU ────────────────────────────────────────────────────
    if proc_items:
        lines.append("🏆 *Top Processos \\(via Zabbix\\)*")
        proc_items.sort(key=lambda x: _safe_float(x.get("lastvalue")), reverse=True)
        for p in proc_items[:8]:
            val = _fmt_val(p.get("lastvalue"), p.get("units", "%"))
            name = esc(p.get("name", "?"))
            lines.append(f"  • {name} — {esc(val)}")
        lines.append("")
    else:
        lines.append(
            "🏆 *Top Processos*\n"
            "_Itens proc\\.cpu\\.util não configurados no Zabbix\\._\n"
            "_Para monitorar processos específicos, adicione itens do tipo:_\n"
            "`proc.cpu.util[nginx]`\n`proc.cpu.util[postgres]`\n"
        )

    # ── Alertas ativos para este host ────────────────────────────────────────
    if host_filter.get("hostids"):
        problems = await zabbix_call(settings.zabbix_url, token, "problem.get", {
            "output": ["name", "severity", "clock"],
            "hostids": host_filter["hostids"],
            "recent": True,
            "limit": 5,
        }) or []
        if problems:
            lines.append("⚠️ *Alertas Ativos*")
            for p in problems:
                sev = str(p.get("severity", "0"))
                lines.append(f"  {SEVERITY_EMOJI.get(sev, '⚪')} {esc(p['name'])} \\(há {esc(age_str(p['clock']))}\\)")
            lines.append("")

    # ── Comandos recomendados ────────────────────────────────────────────────
    lines.append("🛠️ *Comandos para investigação*")
    lines.append("```")
    lines.append("# Processos por CPU")
    lines.append("ps aux --sort=-%cpu | head -20")
    lines.append("")
    lines.append("# Load average e uptime")
    lines.append("uptime && cat /proc/loadavg")
    lines.append("")
    lines.append("# Processos em espera de I/O")
    lines.append("vmstat 1 5")
    lines.append("")
    lines.append("# CPU por processo em tempo real")
    lines.append("top -bn2 -d0.5 | grep -v '^$' | tail -20")
    lines.append("```")

    return "\n".join(lines)


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _fmt_val(val: str | None, units: str = "%") -> str:
    if not val:
        return "N/A"
    try:
        f = float(val)
        if units == "%":
            return f"{f:.1f}%"
        return f"{f:.2f} {units}"
    except ValueError:
        return str(val)


def _safe_float(val) -> float:
    try:
        return float(val)
    except Exception:
        return 0.0


def _no_zabbix_msg(host: str | None) -> str:
    host_part = f" para *{esc(host)}*" if host else ""
    return (
        f"⚡ *Análise de CPU{host_part}*\n\n"
        "⚠️ Zabbix não configurado — não é possível consultar métricas remotas\\.\n\n"
        "🛠️ *Comandos para rodar no host:*\n"
        "```\n"
        "ps aux --sort=-%cpu | head -20\n"
        "top -bn1 | head -20\n"
        "uptime\n"
        "cat /proc/loadavg\n"
        "vmstat 1 3\n"
        "```\n\n"
        "_Configure o Zabbix em Setup → Zabbix para análise automática\\._"
    )
