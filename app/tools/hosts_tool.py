"""
Ferramenta /hosts — lista todos os hosts monitorados em formato de tabela.

Compatível com Zabbix 7.x (available nas interfaces).
"""
from app.tools._zabbix import zabbix_login, zabbix_call, esc, SEVERITY_EMOJI

_IFACE_TYPE = {"1": "Agent", "2": "SNMP", "3": "IPMI", "4": "JMX"}
_SEV_PRIORITY = {"5": 0, "4": 1, "3": 2, "2": 3, "1": 4, "0": 5}

# Status em texto para usar dentro do code block (emojis quebram alinhamento)
_STATUS_TXT = {"1": "OK  ", "2": "DOWN", "0": "??  "}
_STATUS_EMOJI = {"1": "🟢", "2": "🔴", "0": "⚫"}


def _main_interface(host: dict) -> dict:
    """Retorna a interface principal do host."""
    interfaces = host.get("interfaces") or []
    if not interfaces:
        return {}
    # Prefere a primeira disponível, ou a primeira se todas desconhecidas
    for iface in interfaces:
        if iface.get("available") == "1":
            return iface
    return interfaces[0]


def _address(iface: dict) -> str:
    """Retorna IP ou DNS dependendo do modo de conexão."""
    if iface.get("useip") == "1":
        return iface.get("ip") or iface.get("dns") or "—"
    return iface.get("dns") or iface.get("ip") or "—"


def _worst_status(host: dict) -> str:
    """Retorna o pior status entre todas as interfaces."""
    interfaces = host.get("interfaces") or []
    worst = "0"
    for iface in interfaces:
        av = str(iface.get("available", "0"))
        if _SEV_PRIORITY.get(av, 5) < _SEV_PRIORITY.get(worst, 5):
            worst = av
    return worst


def _truncate(s: str, max_len: int) -> str:
    return s if len(s) <= max_len else s[:max_len - 1] + "…"


async def run_hosts(settings) -> str:
    if not settings or not settings.zabbix_url or not settings.zabbix_api_password:
        return (
            "🖥️ *Hosts Monitorados*\n\n"
            "⚠️ Zabbix não configurado\\.\n"
            "_Configure em Setup → Zabbix\\._"
        )

    token = await zabbix_login(
        settings.zabbix_url, settings.zabbix_api_user or "Admin", settings.zabbix_api_password
    )
    if not token:
        return "❌ Não foi possível conectar ao Zabbix\\."

    # ── Busca hosts com interfaces ────────────────────────────────────────────
    hosts = await zabbix_call(settings.zabbix_url, token, "host.get", {
        "output": ["hostid", "host", "name"],
        "selectInterfaces": ["ip", "dns", "useip", "available", "error", "type"],
        "sortfield": "name",
        "limit": 50,
    }) or []

    if not hosts:
        return "🖥️ *Hosts Monitorados*\n\n_Nenhum host encontrado no Zabbix\\._"

    # ── Conta problemas por host via triggers ativos ──────────────────────────
    host_ids = [h["hostid"] for h in hosts]
    triggers_problem = await zabbix_call(settings.zabbix_url, token, "trigger.get", {
        "output": ["triggerid", "priority"],
        "hostids": host_ids,
        "only_true": True,
        "filter": {"value": 1},
        "selectHosts": ["hostid"],
        "limit": 300,
    }) or []

    prob_index: dict[str, dict] = {}
    for t in triggers_problem:
        sev = str(t.get("priority", "0"))
        for th in (t.get("hosts") or []):
            hid = th.get("hostid", "")
            if not hid:
                continue
            if hid not in prob_index:
                prob_index[hid] = {"count": 0, "max_sev": "0"}
            prob_index[hid]["count"] += 1
            curr = prob_index[hid]["max_sev"]
            if _SEV_PRIORITY.get(sev, 5) < _SEV_PRIORITY.get(curr, 5):
                prob_index[hid]["max_sev"] = sev

    # ── Ordena: DOWN primeiro, depois por alertas ─────────────────────────────
    def sort_key(h):
        status = _worst_status(h)
        order = {"2": 0, "0": 1, "1": 2}.get(status, 1)
        probs = prob_index.get(h["hostid"], {}).get("count", 0)
        return (order, -probs)

    hosts_sorted = sorted(hosts, key=sort_key)

    # ── Monta linhas da tabela ────────────────────────────────────────────────
    rows = []
    for h in hosts_sorted:
        hid = h["hostid"]
        name = h.get("name") or h.get("host", "?")
        iface = _main_interface(h)
        status = _worst_status(h)
        address = _address(iface)
        service = _IFACE_TYPE.get(str(iface.get("type", "1")), "Agent")
        pinfo = prob_index.get(hid)
        alerts = pinfo["count"] if pinfo else 0
        max_sev = pinfo["max_sev"] if pinfo else "0"
        rows.append((name, address, service, status, alerts, max_sev))

    # ── Calcula larguras dinâmicas (cap por legibilidade) ─────────────────────
    col_name = min(max(len(r[0]) for r in rows), 22)
    col_addr = min(max(len(r[1]) for r in rows), 17)
    col_svc  = 5   # Agent, SNMP, IPMI, JMX

    header = (
        f"{'HOST':<{col_name}}  {'ENDEREÇO':<{col_addr}}  {'TIPO':<{col_svc}}  ST    ALTS"
    )
    separator = "─" * len(header)

    table_lines = [header, separator]
    for name, address, service, status, alerts, max_sev in rows:
        name_col    = _truncate(name, col_name).ljust(col_name)
        address_col = _truncate(address, col_addr).ljust(col_addr)
        svc_col     = service.ljust(col_svc)
        status_col  = _STATUS_TXT.get(status, "??  ")
        alts_col    = f"{alerts:>4}" if alerts == 0 else f"{SEVERITY_EMOJI.get(max_sev,'⚪')}{alerts:>2}"
        table_lines.append(f"{name_col}  {address_col}  {svc_col}  {status_col}  {alts_col}")

    # ── Resumo ────────────────────────────────────────────────────────────────
    total = len(hosts)
    n_ok   = sum(1 for h in hosts if _worst_status(h) == "1")
    n_down = sum(1 for h in hosts if _worst_status(h) == "2")
    n_unk  = total - n_ok - n_down
    n_prob = len(prob_index)

    summary = (
        f"🖥️ *{total} hosts* — "
        f"🟢 {n_ok} ok  🔴 {n_down} down  ⚫ {n_unk} desconhecido  ⚠️ {n_prob} com alertas"
    )

    table_block = "```\n" + "\n".join(table_lines) + "\n```"

    footer = "_/cpu \\<host\\>  •  /diagnostico \\<host\\>  •  /problemas_"

    return f"{summary}\n\n{table_block}\n{footer}"
