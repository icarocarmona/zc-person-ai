import time
import structlog
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import JSONResponse

from app.config import get_settings
from app.models import ZabbixWebhookPayload
from app.services.dedup_service import DedupService
from app.services.ai_service import AIService
from app.services.whatsapp_service import WhatsAppService

logger = structlog.get_logger(__name__)
router = APIRouter()


def _dedup(request: Request) -> DedupService:
    return request.app.state.dedup_service  # type: ignore[no-any-return]


def _ai(request: Request) -> AIService:
    return request.app.state.ai_service  # type: ignore[no-any-return]


def _whatsapp(request: Request) -> WhatsAppService:
    return request.app.state.whatsapp_service  # type: ignore[no-any-return]


@router.post("/webhook/zabbix", summary="Recebe alertas críticos do Zabbix")
async def receive_zabbix_alert(
    payload: ZabbixWebhookPayload,
    dedup: DedupService = Depends(_dedup),
    ai: AIService = Depends(_ai),
    whatsapp: WhatsAppService = Depends(_whatsapp),
) -> JSONResponse:
    start = time.monotonic()
    settings = get_settings()

    log = logger.bind(
        trigger_id=payload.trigger_id,
        event_id=payload.event_id,
        host=payload.host,
        severity=payload.severity,
        status=payload.status,
    )
    log.info("webhook.received")

    # 1. Filtro de severidade
    if payload.severity not in settings.allowed_severities:
        log.info("webhook.ignored", reason="severity_not_actionable", severity=payload.severity)
        return JSONResponse(
            status_code=200,
            content={
                "status": "ignored",
                "reason": f"severity '{payload.severity}' not in {settings.allowed_severities}",
            },
        )

    # 2. Deduplicação (fail-open: se o Redis cair, processa mesmo assim)
    dedup_key = payload.dedup_key
    try:
        if await dedup.is_duplicate(dedup_key):
            log.info("webhook.ignored", reason="duplicate", dedup_key=dedup_key)
            return JSONResponse(
                status_code=200,
                content={"status": "ignored", "reason": "duplicate within dedup window"},
            )
    except Exception as exc:
        log.warning("webhook.dedup_error_failopen", error=str(exc))

    # 3. Análise de IA
    try:
        log.info("webhook.ai_analysis_start")
        report = await ai.analyze_alert(payload)
        log.info("webhook.ai_analysis_complete", priority=report.priority)
    except Exception as exc:
        log.error("webhook.ai_analysis_failed", error=str(exc), exc_info=True)
        raise HTTPException(status_code=502, detail=f"AI analysis failed: {exc}")

    # 4. Envio WhatsApp
    try:
        log.info("webhook.whatsapp_send_start")
        result = await whatsapp.send_message(report.raw_text)
        log.info("webhook.whatsapp_send_complete")
    except Exception as exc:
        log.error("webhook.whatsapp_send_failed", error=str(exc), exc_info=True)
        raise HTTPException(status_code=502, detail=f"WhatsApp send failed: {exc}")

    elapsed = round(time.monotonic() - start, 2)
    log.info("webhook.complete", elapsed_seconds=elapsed)

    return JSONResponse(
        status_code=200,
        content={
            "status": "processed",
            "trigger_id": payload.trigger_id,
            "event_id": payload.event_id,
            "priority": report.priority,
            "whatsapp_message_id": result.get("key", {}).get("id"),
            "elapsed_seconds": elapsed,
        },
    )
