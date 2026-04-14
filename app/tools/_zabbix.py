"""Helpers compartilhados para acesso à API do Zabbix nas ferramentas."""
import httpx
from datetime import datetime, timezone


async def zabbix_login(base_url: str, user: str, password: str) -> str | None:
    try:
        async with httpx.AsyncClient(timeout=8) as c:
            r = await c.post(f"{base_url}/api_jsonrpc.php", json={
                "jsonrpc": "2.0", "method": "user.login",
                "params": {"username": user, "password": password}, "id": 1,
            })
            data = r.json()
            return data.get("result")
    except Exception:
        return None


async def zabbix_call(base_url: str, token: str, method: str, params: dict) -> list | dict | None:
    try:
        async with httpx.AsyncClient(timeout=10) as c:
            r = await c.post(f"{base_url}/api_jsonrpc.php", json={
                "jsonrpc": "2.0", "method": method, "params": params, "auth": token, "id": 1,
            })
            data = r.json()
            if "error" in data:
                return None
            return data.get("result")
    except Exception:
        return None


def age_str(clock: int | str) -> str:
    """Converte unix timestamp para 'há X min' / 'há X h'."""
    try:
        delta = int(datetime.now(timezone.utc).timestamp()) - int(clock)
        if delta < 60:
            return f"{delta}s"
        elif delta < 3600:
            return f"{delta // 60} min"
        elif delta < 86400:
            h = delta // 3600
            m = (delta % 3600) // 60
            return f"{h}h {m}min" if m else f"{h}h"
        else:
            return f"{delta // 86400} dias"
    except Exception:
        return "?"


def esc(text: str) -> str:
    """Escapa MarkdownV2."""
    for ch in r"_*[]()~`>#+-=|{}.!":
        text = str(text).replace(ch, f"\\{ch}")
    return text


SEVERITY_EMOJI = {
    "0": "⚪", "1": "🔵", "2": "🟡", "3": "🟠", "4": "🔴", "5": "🔴",
}
SEVERITY_LABEL = {
    "0": "Not classified", "1": "Information", "2": "Warning",
    "3": "Average", "4": "High", "5": "Disaster",
}
