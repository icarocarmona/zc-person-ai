import time
import httpx
from fastapi import APIRouter, HTTPException, Request

router = APIRouter(prefix="/api")


@router.get("/status", summary="Status detalhado de cada serviço")
async def get_status(request: Request) -> dict:
    app = request.app
    settings = app.state.settings

    # ------------------------------------------------------------------
    # Redis
    # ------------------------------------------------------------------
    redis_ok = False
    redis_latency_ms: float | None = None
    try:
        t0 = time.monotonic()
        redis_ok = await app.state.dedup_service.health_check()
        redis_latency_ms = round((time.monotonic() - t0) * 1000, 1)
    except Exception:
        pass

    # ------------------------------------------------------------------
    # Banco de configuração (Postgres)
    # ------------------------------------------------------------------
    db_ok = False
    try:
        async with app.state.db_pool.acquire() as conn:
            await conn.fetchval("SELECT 1")
        db_ok = True
    except Exception:
        pass

    # ------------------------------------------------------------------
    # Evolution API
    # ------------------------------------------------------------------
    evolution_ok = False
    evolution_instances: list[str] = []
    whatsapp_connected = False
    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(10.0, connect=5.0)) as client:
            resp = await client.get(
                f"{settings.evolution_base_url}/instance/fetchInstances",
                headers={"apikey": settings.evolution_api_key},
            )
            if resp.status_code == 200:
                evolution_ok = True
                data = resp.json()
                instances = data if isinstance(data, list) else data.get("data", [])
                evolution_instances = [
                    inst.get("instance", {}).get("instanceName", "")
                    for inst in instances
                    if inst.get("instance", {}).get("instanceName")
                ]
                for inst in instances:
                    name = inst.get("instance", {}).get("instanceName", "")
                    state = inst.get("instance", {}).get("connectionStatus", "")
                    if name == settings.evolution_instance_name and state == "open":
                        whatsapp_connected = True
    except Exception:
        pass

    # ------------------------------------------------------------------
    # AI provider
    # ------------------------------------------------------------------
    ai_configured = bool(settings.ai_api_key and not settings.ai_api_key.endswith("***"))
    provider = "openrouter" if "openrouter" in settings.ai_base_url else "openai"

    # ------------------------------------------------------------------
    # Telegram (verificado apenas quando canal = telegram)
    # ------------------------------------------------------------------
    telegram_ok = False
    telegram_bot_username: str | None = None
    telegram_enabled = settings.notification_channel == "telegram"
    if telegram_enabled and settings.telegram_bot_token:
        try:
            result = await app.state.telegram_service.get_me()
            if result.get("ok"):
                telegram_ok = True
                telegram_bot_username = result.get("result", {}).get("username")
        except Exception:
            pass

    return {
        "redis": {"ok": redis_ok, "latency_ms": redis_latency_ms},
        "database": {"ok": db_ok},
        "evolution_api": {"ok": evolution_ok, "instances": evolution_instances},
        "ai_provider": {"ok": ai_configured, "provider": provider, "model": settings.ai_model},
        "whatsapp_connected": whatsapp_connected,
        "telegram": {
            "ok": telegram_ok,
            "bot_username": telegram_bot_username,
            "enabled": telegram_enabled,
        },
    }


@router.post("/test/whatsapp", summary="Envia mensagem de teste via WhatsApp")
async def test_whatsapp(request: Request) -> dict:
    app = request.app
    try:
        result = await app.state.whatsapp_service.send_message(
            "🔔 *Teste de conexão* — Zabbix Alert Agent está operacional!"
        )
        return {"status": "sent", "message_id": result.get("key", {}).get("id", "unknown")}
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Falha ao enviar mensagem: {exc}")


@router.post("/test/telegram", summary="Envia mensagem de teste via Telegram")
async def test_telegram(request: Request) -> dict:
    app = request.app
    try:
        result = await app.state.telegram_service.send_message(
            "🔔 <b>Teste de conexão</b> — Zabbix Alert Agent está operacional!"
        )
        return {
            "status": "sent",
            "message_id": result.get("result", {}).get("message_id", "unknown"),
        }
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Falha ao enviar mensagem: {exc}")
