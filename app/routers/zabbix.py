import httpx
from fastapi import APIRouter, HTTPException, Request

router = APIRouter(prefix="/api/zabbix")

# URL interna Docker — o Zabbix server acessa o agent pela rede interna
_WEBHOOK_URL = "http://zabbix-agent-app:8000/webhook/zabbix"

_MEDIA_SCRIPT = (
    "var params = JSON.parse(value);\n"
    "var req = new HttpRequest();\n"
    "req.addHeader('Content-Type: application/json');\n"
    "var body = JSON.stringify({\n"
    "  triggerId:   params.triggerId,\n"
    "  triggerName: params.triggerName,\n"
    "  host:        params.host,\n"
    "  hostIp:      params.hostIp,\n"
    "  severity:    params.severity,\n"
    "  description: params.description,\n"
    "  eventId:     params.eventId,\n"
    "  status:      params.status,\n"
    "  timestamp:   params.timestamp,\n"
    "  itemName:    params.itemName,\n"
    "  itemValue:   params.itemValue\n"
    "});\n"
    f"var response = req.post('{_WEBHOOK_URL}', body);\n"
    "if (req.getStatus() !== 200) {\n"
    "  throw 'Webhook falhou HTTP ' + req.getStatus() + ': ' + response;\n"
    "}\n"
    "return response;"
)

_MEDIA_PARAMS = [
    {"name": "triggerId",   "value": "{TRIGGER.ID}"},
    {"name": "triggerName", "value": "{TRIGGER.NAME}"},
    {"name": "host",        "value": "{HOST.NAME}"},
    {"name": "hostIp",      "value": "{HOST.IP}"},
    {"name": "severity",    "value": "{EVENT.SEVERITY}"},
    {"name": "description", "value": "{TRIGGER.DESCRIPTION}"},
    {"name": "eventId",     "value": "{EVENT.ID}"},
    {"name": "status",      "value": "{EVENT.STATUS}"},
    {"name": "timestamp",   "value": "{EVENT.DATE} {EVENT.TIME}"},
    {"name": "itemName",    "value": "{ITEM.NAME}"},
    {"name": "itemValue",   "value": "{ITEM.VALUE}"},
]

_MESSAGE_TEMPLATES = [
    {"eventsource": 0, "recovery": 0, "subject": "Problem: {EVENT.NAME}",  "message": "{EVENT.SEVERITY}: {TRIGGER.NAME}\nHost: {HOST.NAME}"},
    {"eventsource": 0, "recovery": 1, "subject": "Resolved: {EVENT.NAME}", "message": "Resolved: {TRIGGER.NAME}\nHost: {HOST.NAME}"},
]


async def _login(base_url: str, user: str, password: str) -> str:
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.post(
            f"{base_url}/api_jsonrpc.php",
            json={"jsonrpc": "2.0", "method": "user.login",
                  "params": {"username": user, "password": password}, "id": 1},
        )
        resp.raise_for_status()
        data = resp.json()
        if "error" in data:
            raise HTTPException(400, detail=data["error"].get("data", "Login falhou"))
        return data["result"]


async def _call(base_url: str, token: str, method: str, params: dict) -> object:
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.post(
            f"{base_url}/api_jsonrpc.php",
            json={"jsonrpc": "2.0", "method": method, "params": params, "auth": token, "id": 1},
        )
        resp.raise_for_status()
        data = resp.json()
        if "error" in data:
            raise HTTPException(400, detail=data["error"].get("data", data["error"]["message"]))
        return data["result"]


@router.get("/status", summary="Verifica conexão e configuração do Zabbix")
async def zabbix_status(request: Request) -> dict:
    settings = request.app.state.settings
    if not settings.zabbix_url or not settings.zabbix_api_password:
        return {"connected": False, "configured": False, "media_type": False, "action": False}

    try:
        token = await _login(settings.zabbix_url, settings.zabbix_api_user or "Admin", settings.zabbix_api_password)

        media_types = await _call(settings.zabbix_url, token, "mediatype.get",
                                  {"filter": {"name": "ZC Alert Agent"}, "output": ["mediatypeid"]})
        media_ok = isinstance(media_types, list) and len(media_types) > 0

        actions = await _call(settings.zabbix_url, token, "action.get",
                              {"filter": {"name": "ZC Alert — Enviar para Agent"}, "output": ["actionid", "status"]})
        action_ok = isinstance(actions, list) and len(actions) > 0
        action_enabled = action_ok and actions[0].get("status") == "0"  # type: ignore[index]

        return {
            "connected": True,
            "configured": media_ok and action_ok,
            "media_type": media_ok,
            "action": action_ok,
            "action_enabled": action_enabled,
        }
    except HTTPException:
        raise
    except Exception as exc:
        return {"connected": False, "configured": False, "error": str(exc)}


@router.post("/configure", summary="Cria/atualiza media type e action no Zabbix")
async def configure_zabbix(request: Request) -> dict:
    settings = request.app.state.settings
    if not settings.zabbix_url or not settings.zabbix_api_password:
        raise HTTPException(400, detail="Zabbix URL e senha são obrigatórios. Configure primeiro em Setup.")

    base_url = settings.zabbix_url
    user = settings.zabbix_api_user or "Admin"
    token = await _login(base_url, user, settings.zabbix_api_password)
    results: dict[str, str] = {}

    # ── Media type ────────────────────────────────────────────────────────────
    existing_mt = await _call(base_url, token, "mediatype.get",
                              {"filter": {"name": "ZC Alert Agent"}, "output": ["mediatypeid"]})
    mt_params: dict = {
        "name": "ZC Alert Agent",
        "type": 4,
        "parameters": _MEDIA_PARAMS,
        "script": _MEDIA_SCRIPT,
        "process_tags": 1,
        "status": 0,
        "message_templates": _MESSAGE_TEMPLATES,
    }

    if isinstance(existing_mt, list) and existing_mt:
        mediatypeid = existing_mt[0]["mediatypeid"]
        mt_params["mediatypeid"] = mediatypeid
        await _call(base_url, token, "mediatype.update", mt_params)
        results["media_type"] = "atualizado"
    else:
        mt = await _call(base_url, token, "mediatype.create", mt_params)
        mediatypeid = mt["mediatypeids"][0]  # type: ignore[index]
        results["media_type"] = "criado"

    # ── User media (Admin) ────────────────────────────────────────────────────
    users = await _call(base_url, token, "user.get",
                        {"output": ["userid"], "filter": {"username": user}})
    adminid = None
    if isinstance(users, list) and users:
        adminid = users[0]["userid"]
        await _call(base_url, token, "user.update", {
            "userid": adminid,
            "medias": [{"mediatypeid": mediatypeid, "sendto": "admin@localhost",
                        "active": 0, "severity": 63, "period": "1-7,00:00-24:00"}],
        })
        results["user_media"] = "configurado"

    # ── Action ────────────────────────────────────────────────────────────────
    existing_action = await _call(base_url, token, "action.get",
                                  {"filter": {"name": "ZC Alert — Enviar para Agent"}, "output": ["actionid"]})
    action_params: dict = {
        "name": "ZC Alert — Enviar para Agent",
        "eventsource": 0,
        "status": 0,
        "filter": {"evaltype": 0, "conditions": [{"conditiontype": 4, "operator": 5, "value": "2"}]},
        "operations": [{
            "operationtype": 0,
            "opmessage": {"default_msg": 1, "mediatypeid": mediatypeid},
            "opmessage_usr": [{"userid": adminid}] if adminid else [],
        }],
        "recovery_operations": [{
            "operationtype": 0,
            "opmessage": {"default_msg": 1, "mediatypeid": mediatypeid},
            "opmessage_usr": [{"userid": adminid}] if adminid else [],
        }],
    }

    if isinstance(existing_action, list) and existing_action:
        action_params["actionid"] = existing_action[0]["actionid"]
        await _call(base_url, token, "action.update", action_params)
        results["action"] = "atualizada"
    else:
        await _call(base_url, token, "action.create", action_params)
        results["action"] = "criada"

    return {"status": "ok", "results": results}
