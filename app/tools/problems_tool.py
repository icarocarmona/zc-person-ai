"""Ferramenta /problemas — lista todos os alertas ativos no Zabbix."""
from app.tools._zabbix import zabbix_login, zabbix_call, age_str, esc, SEVERITY_EMOJI, SEVERITY_LABEL


async def run_problems(settings) -> str:
    if not settings or not settings.zabbix_url or not settings.zabbix_api_password:
        return (
            "⚠️ *Zabbix não configurado*\n\n"
            "Configure a integração em *Setup → Zabbix* para usar este comando\\."
        )

    token = await zabbix_login(settings.zabbix_url, settings.zabbix_api_user or "Admin", settings.zabbix_api_password)
    if not token:
        return "❌ Não foi possível conectar ao Zabbix\\. Verifique as credenciais em *Setup → Zabbix*\\."

    problems = await zabbix_call(settings.zabbix_url, token, "problem.get", {
        "output": ["eventid", "name", "severity", "clock", "acknowledged"],
        "recent": True,
        "sortfield": "severity",
        "sortorder": "DESC",
        "limit": 20,
    })

    if not problems:
        return "✅ *Sem problemas ativos* — todos os serviços estão operacionais\\! 🎉"

    lines = [f"🚨 *Problemas Ativos — {len(problems)} alerta{'s' if len(problems) > 1 else ''}*\n"]

    for p in problems:
        sev = str(p.get("severity", "0"))
        emoji = SEVERITY_EMOJI.get(sev, "⚪")
        label = SEVERITY_LABEL.get(sev, "?")
        name = esc(p.get("name", "?"))
        age = esc(age_str(p.get("clock", 0)))
        ack = " ✓" if p.get("acknowledged") == "1" else ""
        lines.append(f"{emoji} *{label}*{ack} • {name}\n   🕐 há {age}\n")

    lines.append("_Use /cpu \\<host\\> para análise detalhada\\._")
    return "\n".join(lines)
